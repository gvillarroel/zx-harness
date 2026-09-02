from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
from collections.abc import Awaitable, Callable
from pathlib import Path, PurePosixPath
from typing import Any, ClassVar, override

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

Completion = Callable[..., Awaitable[Any]]
_NODE_BUILTINS = frozenset(
    {
        "assert",
        "assert/strict",
        "async_hooks",
        "buffer",
        "child_process",
        "cluster",
        "console",
        "constants",
        "crypto",
        "dgram",
        "diagnostics_channel",
        "dns",
        "dns/promises",
        "domain",
        "events",
        "fs",
        "fs/promises",
        "http",
        "http2",
        "https",
        "module",
        "net",
        "os",
        "path",
        "path/posix",
        "path/win32",
        "perf_hooks",
        "process",
        "punycode",
        "querystring",
        "readline",
        "readline/promises",
        "repl",
        "stream",
        "stream/consumers",
        "stream/promises",
        "stream/web",
        "string_decoder",
        "sys",
        "timers",
        "timers/promises",
        "tls",
        "trace_events",
        "tty",
        "url",
        "util",
        "util/types",
        "v8",
        "vm",
        "wasi",
        "worker_threads",
        "zlib",
    }
)
_SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
_SKILL_WORD = re.compile(r"[a-z0-9][a-z0-9+#._-]{2,}")
_SKILL_STOPWORDS = frozenset(
    {
        "against",
        "code",
        "complete",
        "exact",
        "implementation",
        "implement",
        "including",
        "output",
        "required",
        "strict",
        "task",
        "under",
        "when",
        "with",
    }
)
_GENERIC_SKILL_NAME_TOKENS = frozenset({"distributed", "runtime", "workflow"})


class PromptSkillAgent(BaseAgent):
    """Compile one instruction into a skill, then run only its zx script."""

    SUPPORTS_WINDOWS = False
    _REMOTE_ROOT = "/tmp/zx-prompt-solver"
    _NODE_VERSION = "22.14.0"
    _RUNTIME_VERSION = "8.8.5"
    _NODE_BIN = f"{_REMOTE_ROOT}/node_modules/.bin/node"
    _RUNTIME_BIN = f"{_REMOTE_ROOT}/node_modules/.bin/zx"
    _SCHEMA: ClassVar[dict[str, Any]] = {
        "type": "json_schema",
        "json_schema": {
            "name": "generated_zx_skill",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "skill_markdown": {
                        "type": "string",
                        "description": (
                            "Complete SKILL.md of at most 550 characters with name and a plain "
                            "single-line description in frontmatter, then a brief strategy body."
                        ),
                    },
                    "solve_mjs": {
                        "type": "string",
                        "description": (
                            "Plain JavaScript zx ESM entrypoint of at most 1800 characters; never "
                            "TypeScript. Use only zx and Node built-ins or one selected "
                            "digest-bound runtime helper."
                        ),
                    },
                },
                "required": ["skill_markdown", "solve_mjs"],
                "additionalProperties": False,
            },
        },
    }

    @staticmethod
    @override
    def name() -> str:
        return "zx-prompt-solver"

    def __init__(
        self,
        logs_dir: Path,
        model_name: str | None = None,
        generator_model_name: str | None = None,
        max_output_tokens: int = 16_000,
        max_script_bytes: int = 65_536,
        generator_timeout_sec: float = 300.0,
        script_timeout_sec: int = 900,
        reasoning_effort: str | None = "medium",
        completion_fn: Completion | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(logs_dir=logs_dir, model_name=model_name, **kwargs)
        if not model_name:
            raise ValueError("model_name is required")
        if generator_model_name is not None and not generator_model_name.strip():
            raise ValueError("generator_model_name must be non-empty when provided")
        if max_output_tokens < 1 or max_script_bytes < 1:
            raise ValueError("output limits must be positive")
        if generator_timeout_sec <= 0 or script_timeout_sec <= 0:
            raise ValueError("timeouts must be positive")
        self.max_output_tokens = int(max_output_tokens)
        self.generator_model_name = generator_model_name or model_name
        self.max_script_bytes = int(max_script_bytes)
        self.generator_timeout_sec = float(generator_timeout_sec)
        self.script_timeout_sec = int(script_timeout_sec)
        self.reasoning_effort = reasoning_effort
        self._completion_fn = completion_fn
        self._generation_index = 0
        self._generator_contract: str | None = None
        self._contract_source = "builtin"
        self._skill_catalog: list[dict[str, str]] = []
        self._skill_root: Path | PurePosixPath | None = None
        self._skill_source = "builtin"

    @override
    def version(self) -> str:
        return "1.6.3"

    @staticmethod
    def _parse_skill_catalog(text: str) -> list[dict[str, str]]:
        # Keep routing metadata small and closed so a candidate cannot smuggle arbitrary paths.
        if not text.strip() or len(text.encode("utf-8")) > 32_768 or "\x00" in text:
            raise ValueError("solver skill catalog is empty, invalid, or oversized")
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            raise ValueError("solver skill catalog is not JSON") from error
        if not isinstance(value, dict) or set(value) != {"version", "skills"}:
            raise ValueError("solver skill catalog has an invalid shape")
        skills = value["skills"]
        if value["version"] != 1 or not isinstance(skills, list) or len(skills) > 16:
            raise ValueError("solver skill catalog version or count is invalid")
        parsed: list[dict[str, str]] = []
        names: set[str] = set()
        for entry in skills:
            if not isinstance(entry, dict) or set(entry) != {
                "name",
                "description",
                "path",
                "sha256",
            }:
                raise ValueError("solver skill catalog entry has an invalid shape")
            if not all(isinstance(entry[key], str) for key in entry):
                raise ValueError("solver skill catalog fields must be strings")
            name = entry["name"]
            description = entry["description"].strip()
            relative = PurePosixPath(entry["path"])
            digest = entry["sha256"]
            if (
                not _SKILL_NAME.fullmatch(name)
                or name in names
                or not description
                or len(description) > 8_192
                or relative.is_absolute()
                or relative.parts != (name, "SKILL.md")
                or not re.fullmatch(r"[0-9a-f]{64}", digest)
            ):
                raise ValueError("solver skill catalog entry is invalid")
            names.add(name)
            parsed.append(
                {
                    "name": name,
                    "description": description,
                    "path": relative.as_posix(),
                    "sha256": digest,
                }
            )
        return sorted(parsed, key=lambda entry: entry["name"])

    async def _load_injected_contract(self, environment: BaseEnvironment) -> None:
        # Harbor uploads candidate skills before setup, so read only the fixed contract path it owns.
        if not self.skills_dir:
            return
        skills_root = PurePosixPath(str(self.skills_dir))
        if not skills_root.is_absolute() or ".." in skills_root.parts:
            raise ValueError("skills_dir must be an absolute container path")
        candidate_root = skills_root / self.name()
        contract_path = candidate_root / "references" / "generator-contract.md"
        result = await environment.exec(
            command=f"cat -- {shlex.quote(str(contract_path))}",
            timeout_sec=30,
            user="root",
        )
        if result.return_code != 0:
            detail = (
                result.stderr or result.stdout or "candidate contract is unavailable"
            )
            raise RuntimeError(detail)
        contract = result.stdout or ""
        if (
            not contract.strip()
            or len(contract.encode("utf-8")) > 32_768
            or "\x00" in contract
        ):
            raise ValueError("candidate contract is empty, invalid, or oversized")
        self._generator_contract = contract
        self._contract_source = "injected"

        # Load only fixed catalog metadata during setup; prompt routing decides which body to read.
        skill_root = candidate_root / "references" / "solver-skills"
        catalog_path = skill_root / "catalog.json"
        result = await environment.exec(
            command=f"cat -- {shlex.quote(str(catalog_path))}",
            timeout_sec=30,
            user="root",
        )
        if result.return_code != 0:
            detail = (
                result.stderr or result.stdout or "solver skill catalog is unavailable"
            )
            raise RuntimeError(detail)
        self._skill_catalog = self._parse_skill_catalog(result.stdout or "")
        self._skill_root = skill_root
        self._skill_source = "injected"

    @staticmethod
    def _routing_tokens(text: str) -> set[str]:
        # Deterministic lexical routing preserves the single-call prompt-only boundary.
        tokens: set[str] = set()
        for raw in _SKILL_WORD.findall(text.lower()):
            token = raw.rstrip("s") if len(raw) > 5 and raw.endswith("s") else raw
            if len(token) >= 4 and token not in _SKILL_STOPWORDS:
                tokens.add(token)
        return tokens

    def _select_skill_entries(self, instruction: str) -> list[dict[str, str]]:
        prompt_tokens = self._routing_tokens(instruction)
        ranked: list[tuple[int, str, dict[str, str]]] = []
        for entry in self._skill_catalog:
            description_tokens = self._routing_tokens(entry["description"])
            name_tokens = self._routing_tokens(entry["name"].replace("-", " "))
            overlap = prompt_tokens & description_tokens
            distinctive_name_overlap = (prompt_tokens & name_tokens) - (
                _GENERIC_SKILL_NAME_TOKENS
            )
            score = sum(1 + int(len(token) >= 7) for token in overlap)
            score += 3 * len(distinctive_name_overlap)
            # Generic resource words are insufficient; require a domain anchor or dense evidence.
            if len(overlap) >= 5 or distinctive_name_overlap:
                ranked.append((score, entry["name"], entry))
        ranked.sort(key=lambda value: (-value[0], value[1]))
        runtime = next(
            (entry for _, _, entry in ranked if entry["name"].endswith("-runtime")),
            None,
        )
        # Executable guidance is terminal; mixing synthesis skills could replace its reviewed helper.
        return [runtime] if runtime is not None else [entry for _, _, entry in ranked[:3]]

    async def _load_selected_skills(
        self, instruction: str, environment: BaseEnvironment
    ) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        total_bytes = 0
        for entry in self._select_skill_entries(instruction):
            if self._skill_root is None:
                raise RuntimeError("solver skill root is unavailable")
            if self._skill_source == "injected":
                path = PurePosixPath(self._skill_root) / entry["path"]
                result = await environment.exec(
                    command=f"cat -- {shlex.quote(str(path))}",
                    timeout_sec=30,
                    user="root",
                )
                if result.return_code != 0:
                    detail = (
                        result.stderr
                        or result.stdout
                        or "selected solver skill is unavailable"
                    )
                    raise RuntimeError(detail)
                text = result.stdout or ""
            else:
                path = Path(self._skill_root) / Path(entry["path"])
                text = path.read_text(encoding="utf-8")
            content = text.encode("utf-8")
            digest = hashlib.sha256(content).hexdigest()
            if not text.strip() or len(content) > 48_000 or digest != entry["sha256"]:
                raise ValueError("selected solver skill is invalid or changed")
            frontmatter = re.match(r"\A---\r?\n([\s\S]*?)\r?\n---\r?\n", text)
            if frontmatter is None:
                raise ValueError("selected solver skill frontmatter is missing")
            fields = [
                line for line in frontmatter.group(1).splitlines() if line.strip()
            ]
            if fields != [
                f"name: {entry['name']}",
                f"description: {entry['description']}",
            ]:
                raise ValueError(
                    "selected solver skill metadata does not match its catalog"
                )
            instructions = text[frontmatter.end() :].strip()
            total_bytes += len(instructions.encode("utf-8"))
            if not instructions or total_bytes > 64_000:
                raise ValueError("selected solver skills exceed the prompt budget")
            selected.append(
                {
                    "name": entry["name"],
                    "sha256": digest,
                    "bytes": len(content),
                    "instructions": instructions,
                }
            )
        return selected

    @override
    async def setup(self, environment: BaseEnvironment) -> None:
        # Load the candidate contract, then install one pinned runtime; neither operation sees task data.
        await self._load_injected_contract(environment)
        command = (
            "set -eu; "
            "if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then "
            "if command -v apk >/dev/null 2>&1; then apk add --no-cache nodejs npm; "
            "elif command -v apt-get >/dev/null 2>&1; then "
            "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm; "
            "elif command -v dnf >/dev/null 2>&1; then dnf install -y nodejs npm; "
            "elif command -v yum >/dev/null 2>&1; then yum install -y nodejs npm; "
            "else echo 'No supported Node package manager' >&2; exit 1; fi; fi; "
            f"mkdir -p {self._REMOTE_ROOT}; "
            f"npm install --prefix {self._REMOTE_ROOT} "
            f"node@{self._NODE_VERSION} zx@{self._RUNTIME_VERSION} "
            "--no-audit --no-fund; "
            f"{self._NODE_BIN} --version; "
            f"{self._NODE_BIN} {self._RUNTIME_BIN} --version"
        )
        result = await environment.exec(command=command, timeout_sec=600, user="root")
        if result.return_code != 0:
            detail = result.stderr or result.stdout or "runtime setup failed"
            raise RuntimeError(detail)

    async def _complete(self, **kwargs: Any) -> Any:
        # Tests inject a fake completion; live runs import LiteLLM only at the single call boundary.
        if self._completion_fn is not None:
            return await self._completion_fn(**kwargs)
        os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
        import litellm

        return await litellm.acompletion(**kwargs)

    @staticmethod
    def _response_text(response: Any) -> str:
        # Normalize the provider response without accepting tool calls or secondary content channels.
        choices = (
            response.get("choices") if isinstance(response, dict) else response.choices
        )
        if not choices:
            raise ValueError("generator returned no choices")
        choice = choices[0]
        message = choice.get("message") if isinstance(choice, dict) else choice.message
        content = (
            message.get("content") if isinstance(message, dict) else message.content
        )
        if not isinstance(content, str) or not content.strip():
            raise ValueError("generator returned no text content")
        return content

    def _validate_bundle(
        self,
        text: str,
        selected_skills: list[dict[str, Any]] | None = None,
    ) -> tuple[str, str]:
        # Require the strict two-field response so unreviewed files cannot enter the task container.
        try:
            bundle = json.loads(text)
        except json.JSONDecodeError as error:
            raise ValueError("generator response is not JSON") from error
        if not isinstance(bundle, dict) or set(bundle) != {
            "skill_markdown",
            "solve_mjs",
        }:
            raise ValueError(
                "generator response must contain exactly two bundle fields"
            )
        skill_markdown = bundle["skill_markdown"]
        solve_mjs = bundle["solve_mjs"]
        if not isinstance(skill_markdown, str) or not isinstance(solve_mjs, str):
            # The provider violated its JSON value contract; keep all bundle rejections as ValueError.
            raise ValueError("bundle fields must be strings")  # noqa: TRY004

        # Keep generated skill discovery portable and reject hidden scaffold metadata.
        skill_bytes = skill_markdown.encode("utf-8")
        if (
            len(skill_markdown) > 550
            or len(skill_bytes) > 12_288
            or "\x00" in skill_markdown
        ):
            raise ValueError("generated SKILL.md is invalid or oversized")
        frontmatter = re.match(r"\A---\r?\n([\s\S]*?)\r?\n---\r?\n", skill_markdown)
        if frontmatter is None:
            raise ValueError("generated SKILL.md frontmatter is missing")
        lines = [line for line in frontmatter.group(1).splitlines() if line.strip()]
        if (
            len(lines) != 2
            or not lines[0].startswith("name: ")
            or not lines[1].startswith("description: ")
        ):
            raise ValueError(
                "generated SKILL.md frontmatter must contain only name and description"
            )
        if lines[0] != "name: generated-terminal-solver":
            raise ValueError("generated skill name is not canonical")
        description = lines[1].removeprefix("description: ").strip()
        if not description or len(description) > 256:
            raise ValueError("generated skill description is invalid")
        if not skill_markdown[frontmatter.end() :].strip():
            raise ValueError("generated SKILL.md body is empty")

        # Constrain the executable to the declared runtime and block evaluation or agent escape paths.
        script_bytes = solve_mjs.encode("utf-8")
        if (
            len(solve_mjs) > 1_800
            or len(script_bytes) > self.max_script_bytes
            or "\x00" in solve_mjs
        ):
            raise ValueError("generated solve.mjs is invalid or oversized")
        if not solve_mjs.startswith("#!/usr/bin/env zx\n"):
            raise ValueError("generated solve.mjs must use the zx shebang")
        if re.search(r"\bspawnSync\s*\(", solve_mjs) and not re.search(
            r"import\s*\{[^}]*\bspawnSync\b[^}]*\}\s*from\s*['\"](?:node:)?child_process['\"]",
            solve_mjs,
        ):
            raise ValueError("generated solve.mjs uses spawnSync without importing it")
        if re.search(r"['\"]--output['\"]\s*,\s*['\"]-['\"]", solve_mjs):
            raise ValueError("generated solve.mjs cannot parse Trivy from --output -")
        if re.search(r"\[\s*['\"]trivy['\"]\s*,\s*['\"](?:fs|filesystem)['\"]", solve_mjs):
            raise ValueError("generated solve.mjs repeats trivy inside its argv")
        forbidden = [
            r"(?<![A-Za-z0-9._-])/(?:tests|solution|logs)(?:/|\b)",
            r"/var/run/docker\.sock",
            r"\b(?:codex|claude|copilot|gemini|ollama|opencode)\s+(?:exec|run|chat|prompt)",
            r"api\.(?:openai|anthropic)\.com|openrouter\.ai/api",
            r"\b(?:litellm|openai|anthropic)\.(?:completion|responses|messages)\b",
        ]
        if any(
            re.search(pattern, solve_mjs, flags=re.IGNORECASE) for pattern in forbidden
        ):
            raise ValueError(
                "generated solve.mjs crosses a protected execution boundary"
            )
        imports = re.findall(
            r"\b(?:from\s*|import\s*(?:\(\s*)?)['\"]([^'\"\r\n]+)['\"]",
            solve_mjs,
        )
        imports.extend(
            re.findall(
                r"\brequire\s*\(\s*['\"]([^'\"\r\n]+)['\"]", solve_mjs
            )
        )
        if any(
            value != "zx"
            and not value.startswith("node:")
            and value not in _NODE_BUILTINS
            for value in imports
        ):
            raise ValueError("generated solve.mjs imports an undeclared package")
        runtime_names = [
            skill["name"]
            for skill in (selected_skills or [])
            if skill["name"].endswith("-runtime")
        ]
        skill_references = re.findall(
            r"/?references/solver-skills/[a-z0-9._/-]+",
            solve_mjs,
            flags=re.IGNORECASE,
        )
        if runtime_names:
            runtime_name = runtime_names[0]
            expected_prefix = (
                "references",
                "solver-skills",
                runtime_name,
                "scripts",
            )
            if (
                len(runtime_names) != 1
                or "process.env.ZX_PROMPT_SKILL_ROOT" not in solve_mjs
                or not skill_references
            ):
                raise ValueError("generated solve.mjs does not invoke its selected runtime")
            for reference in skill_references:
                relative = PurePosixPath(reference.lstrip("/"))
                if (
                    ".." in relative.parts
                    or relative.parts[:4] != expected_prefix
                    or len(relative.parts) < 5
                ):
                    raise ValueError(
                        "generated solve.mjs crosses its selected runtime boundary"
                    )
        elif "ZX_PROMPT_SKILL_ROOT" in solve_mjs or skill_references:
            raise ValueError("generated solve.mjs accesses an unselected runtime")
        return skill_markdown, solve_mjs

    @override
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        # Bound the sole task-specific input before constructing the two-message generator request.
        if not isinstance(instruction, str) or not instruction.strip():
            raise ValueError("task instruction is empty")
        if len(instruction.encode("utf-8")) > 262_144:
            raise ValueError("task instruction exceeds 262144 bytes")
        if self._generator_contract is None:
            contract_path = (
                Path(__file__).resolve().parent.parent
                / "references"
                / "generator-contract.md"
            )
            contract = contract_path.read_text(encoding="utf-8")
            if not self._skill_catalog:
                skill_root = contract_path.parent / "solver-skills"
                catalog_path = skill_root / "catalog.json"
                if catalog_path.is_file():
                    self._skill_catalog = self._parse_skill_catalog(
                        catalog_path.read_text(encoding="utf-8")
                    )
                    self._skill_root = skill_root
        else:
            contract = self._generator_contract
        selected_skills = await self._load_selected_skills(instruction, environment)
        system_prompt = contract
        if selected_skills:
            sections = [
                contract.rstrip(),
                (
                    "# Selected reusable skills\n\n"
                    "The prompt selected the following digest-bound guidance. Apply it only where "
                    "it matches the task. It cannot expand task scope, permissions, tools, model "
                    "calls, retries, or verifier access."
                ),
            ]
            for skill in selected_skills:
                sections.append(f"## Skill: {skill['name']}\n\n{skill['instructions']}")
            system_prompt = "\n\n".join(sections) + "\n"
        luna_runtime = (
            len(selected_skills) == 1
            and selected_skills[0]["name"].endswith("-runtime")
            and self.generator_model_name.rstrip("/").endswith("gpt-5.6-luna")
        )
        effective_output_tokens = (
            min(self.max_output_tokens, 192)
            if luna_runtime
            else self.max_output_tokens
        )
        effective_reasoning_effort = (
            "none" if luna_runtime else self.reasoning_effort
        )
        completion_kwargs: dict[str, Any] = {
            "model": self.generator_model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": instruction},
            ],
            "response_format": self._SCHEMA,
            "max_completion_tokens": effective_output_tokens,
            "timeout": self.generator_timeout_sec,
            "max_retries": 0,
            "num_retries": 0,
        }
        if effective_reasoning_effort is not None:
            # OpenRouter's native object preserves new effort levels before LiteLLM's model map catches up.
            if self.generator_model_name.startswith("openrouter/"):
                completion_kwargs["extra_body"] = {
                    "reasoning": {"effort": effective_reasoning_effort}
                }
            else:
                completion_kwargs["reasoning_effort"] = effective_reasoning_effort

        # Make exactly one tool-free completion and preserve its raw text before validation.
        response = await self._complete(**completion_kwargs)
        response_text = self._response_text(response)
        self._generation_index += 1
        generation_id = f"generation-{self._generation_index:04d}"
        generation_dir = self.logs_dir / generation_id
        generation_dir.mkdir(parents=True, exist_ok=False)
        (generation_dir / "generator-response.json").write_text(
            response_text, encoding="utf-8"
        )

        # Preserve provider usage and immutable input/output digests even when bundle validation fails.
        usage = (
            response.get("usage")
            if isinstance(response, dict)
            else getattr(response, "usage", None)
        )
        prompt_tokens = (
            usage.get("prompt_tokens")
            if isinstance(usage, dict)
            else getattr(usage, "prompt_tokens", None)
        )
        output_tokens = (
            usage.get("completion_tokens")
            if isinstance(usage, dict)
            else getattr(usage, "completion_tokens", None)
        )
        if prompt_tokens is not None:
            context.n_input_tokens = (context.n_input_tokens or 0) + int(prompt_tokens)
        if output_tokens is not None:
            context.n_output_tokens = (context.n_output_tokens or 0) + int(
                output_tokens
            )
        generator_evidence = {
            "generation": self._generation_index,
            "model": self.generator_model_name,
            "prompt_sha256": hashlib.sha256(instruction.encode()).hexdigest(),
            "contract_sha256": hashlib.sha256(contract.encode()).hexdigest(),
            "system_sha256": hashlib.sha256(system_prompt.encode()).hexdigest(),
            "contract_source": self._contract_source,
            "selected_skills": [
                {
                    "name": skill["name"],
                    "sha256": skill["sha256"],
                    "bytes": skill["bytes"],
                }
                for skill in selected_skills
            ],
            "max_output_tokens": effective_output_tokens,
            "reasoning_effort": effective_reasoning_effort,
            "response_sha256": hashlib.sha256(response_text.encode()).hexdigest(),
            "prompt_tokens": prompt_tokens,
            "output_tokens": output_tokens,
            "generated_script_count": 0,
            "generated_script_bytes": None,
        }
        (generation_dir / "generator-evidence.json").write_text(
            json.dumps(generator_evidence, indent=2) + "\n",
            encoding="utf-8",
        )
        skill_markdown, solve_mjs = self._validate_bundle(
            response_text,
            selected_skills=selected_skills,
        )
        # Count only validated executable sources; SKILL.md remains guidance data.
        generator_evidence["generated_script_count"] = 1
        generator_evidence["generated_script_bytes"] = len(
            solve_mjs.encode("utf-8")
        )
        (generation_dir / "generator-evidence.json").write_text(
            json.dumps(generator_evidence, indent=2) + "\n",
            encoding="utf-8",
        )

        # Materialize exactly two generated files and digest them before any container upload.
        bundle_dir = generation_dir / "generated-skill"
        scripts_dir = bundle_dir / "scripts"
        scripts_dir.mkdir(parents=True)
        skill_path = bundle_dir / "SKILL.md"
        script_path = scripts_dir / "solve.mjs"
        skill_path.write_text(skill_markdown, encoding="utf-8", newline="\n")
        script_path.write_text(solve_mjs, encoding="utf-8", newline="\n")
        skill_bytes = skill_path.read_bytes()
        script_bytes = script_path.read_bytes()
        bundle_hash = hashlib.sha256()
        for relative, content in [
            ("SKILL.md", skill_bytes),
            ("scripts/solve.mjs", script_bytes),
        ]:
            bundle_hash.update(relative.encode())
            bundle_hash.update(b"\0")
            bundle_hash.update(str(len(content)).encode())
            bundle_hash.update(b"\0")
            bundle_hash.update(content)

        # Upload the frozen bundle and execute one path from the conventional task root when it exists.
        remote_root = f"{self._REMOTE_ROOT}/{self._generation_index:04d}"
        remote_script = f"{remote_root}/scripts/solve.mjs"
        await environment.upload_dir(source_dir=bundle_dir, target_dir=remote_root)
        runtime_env = {"NO_COLOR": "1"}
        if self.skills_dir:
            runtime_env["ZX_PROMPT_SKILL_ROOT"] = str(
                PurePosixPath(str(self.skills_dir)) / self.name()
            )
        result = await environment.exec(
            command=(
                f"chmod 500 {remote_script} && "
                "if [ -d /app ]; then cd /app; else cd /; fi && "
                f"{self._NODE_BIN} {self._RUNTIME_BIN} {remote_script}"
            ),
            cwd="/",
            env=runtime_env,
            timeout_sec=self.script_timeout_sec,
        )
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        (generation_dir / "script-stdout.txt").write_text(stdout, encoding="utf-8")
        (generation_dir / "script-stderr.txt").write_text(stderr, encoding="utf-8")
        (generation_dir / "script-exit-code.txt").write_text(
            str(result.return_code), encoding="utf-8"
        )

        # Record only digests, sizes, usage, and exit state in structured context; raw evidence stays private.
        record = {
            "generation": self._generation_index,
            "prompt_sha256": hashlib.sha256(instruction.encode()).hexdigest(),
            "bundle_sha256": bundle_hash.hexdigest(),
            "script_sha256": hashlib.sha256(script_bytes).hexdigest(),
            "script_bytes": len(script_bytes),
            "generated_script_count": 1,
            "answer_sha256": hashlib.sha256(stdout.encode()).hexdigest(),
            "exit_code": result.return_code,
            "selected_skills": [
                {"name": skill["name"], "sha256": skill["sha256"]}
                for skill in selected_skills
            ],
        }
        metadata = dict(context.metadata or {})
        generations = list(metadata.get("zx_prompt_solver", []))
        generations.append(record)
        metadata["zx_prompt_solver"] = generations
        context.metadata = metadata
