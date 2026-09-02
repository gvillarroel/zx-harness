#!/usr/bin/env python3

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

from harbor.models.agent.context import AgentContext
from prompt_skill_agent import PromptSkillAgent


async def main() -> None:
    # Create one isolated host log tree and one fake task root for observable script execution.
    with tempfile.TemporaryDirectory(prefix="zx-prompt-solver-") as temporary:
        root = Path(temporary)
        logs = root / "logs"
        app = root / "app"
        logs.mkdir()
        app.mkdir()
        events: list[str] = []
        prompt = "prompt-only-sentinel-7d4711b6"
        skill_markdown = (
            "---\n"
            "name: generated-terminal-solver\n"
            "description: Solve the isolated validation task.\n"
            "---\n\n"
            "# Strategy\n\nRun the generated entrypoint once.\n"
        )
        solve_mjs = "#!/usr/bin/env zx\nimport fs from 'fs';\nfs.statSync('.');\nconsole.log('fixture-answer');\n"
        runtime_solve_mjs = (
            "#!/usr/bin/env zx\n"
            "import{spawnSync as s}from'child_process';const p=process.env.ZX_PROMPT_SKILL_ROOT+"
            "'/references/solver-skills/compact-topic-workflow-runtime/scripts/install.mjs',"
            "r=s(process.execPath,[p],{stdio:'inherit'});"
            "if(r.error||r.signal||r.status)throw r.error||Error(r.signal||r.status)"
        )

        async def completion(**kwargs):
            # Prove no environment operation or extra task evidence precedes the single model call.
            assert events == []
            events.append("completion")
            assert kwargs["messages"][1] == {"role": "user", "content": prompt}
            assert prompt not in kwargs["messages"][0]["content"]
            assert len(kwargs["messages"]) == 2
            assert "tools" not in kwargs
            assert kwargs["max_retries"] == 0 and kwargs["num_retries"] == 0
            assert kwargs["response_format"]["json_schema"]["strict"] is True
            assert kwargs["max_completion_tokens"] == 16_000
            assert kwargs["extra_body"] == {"reasoning": {"effort": "medium"}}
            assert "reasoning_effort" not in kwargs
            content = json.dumps(
                {"skill_markdown": skill_markdown, "solve_mjs": solve_mjs}
            )
            usage = SimpleNamespace(prompt_tokens=17, completion_tokens=29)
            message = SimpleNamespace(content=content)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=message)], usage=usage
            )

        class FakeEnvironment:
            def __init__(
                self, event_log: list[str] | None = None, label: str = "baseline"
            ) -> None:
                self.events = events if event_log is None else event_log
                self.label = label
                self.uploaded: Path | None = None

            async def upload_dir(self, source_dir, target_dir) -> None:
                # Copy the frozen bundle so the executed bytes are independent of the generator log tree.
                self.events.append("upload")
                assert target_dir == "/tmp/zx-prompt-solver/0001"
                relative_files = sorted(
                    str(path.relative_to(source_dir)).replace("\\", "/")
                    for path in Path(source_dir).rglob("*")
                    if path.is_file()
                )
                assert relative_files == ["SKILL.md", "scripts/solve.mjs"]
                self.uploaded = root / f"uploaded-{self.label}"
                shutil.copytree(Path(source_dir), self.uploaded)

            async def exec(
                self, command, cwd=None, env=None, timeout_sec=None, user=None
            ):
                # Execute the uploaded script itself; the fake maps Harbor's preferred task path locally.
                self.events.append("exec")
                assert command == (
                    "chmod 500 /tmp/zx-prompt-solver/0001/scripts/solve.mjs && "
                    "if [ -d /app ]; then cd /app; else cd /; fi && "
                    "/tmp/zx-prompt-solver/node_modules/.bin/node "
                    "/tmp/zx-prompt-solver/node_modules/.bin/zx "
                    "/tmp/zx-prompt-solver/0001/scripts/solve.mjs"
                )
                expected_env = {"NO_COLOR": "1"}
                if self.label == "injected":
                    expected_env["ZX_PROMPT_SKILL_ROOT"] = (
                        "/harbor/skills/zx-prompt-solver"
                    )
                assert cwd == "/" and env == expected_env
                assert self.uploaded is not None
                if self.label == "routed":
                    assert (
                        self.uploaded / "scripts" / "solve.mjs"
                    ).read_text() == runtime_solve_mjs
                    return SimpleNamespace(
                        return_code=0,
                        stdout="compact topic workflow installed\n",
                        stderr="",
                    )
                node = shutil.which("node")
                assert node is not None
                process = await asyncio.create_subprocess_exec(
                    node,
                    str(self.uploaded / "scripts" / "solve.mjs"),
                    cwd=app,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout_sec
                )
                return SimpleNamespace(
                    return_code=process.returncode,
                    stdout=stdout.decode(),
                    stderr=stderr.decode(),
                )

        # Run the complete generation-upload-execution boundary and inspect its private evidence.
        context = AgentContext()
        environment = FakeEnvironment()
        agent = PromptSkillAgent(
            logs_dir=logs,
            model_name="gpt-5.6-luna",
            generator_model_name="openrouter/openai/gpt-5.6-luna",
            completion_fn=completion,
        )
        await agent.run(prompt, environment, context)
        assert events == ["completion", "upload", "exec"]
        assert (
            logs / "generation-0001" / "script-stdout.txt"
        ).read_text() == "fixture-answer\n"
        assert (logs / "generation-0001" / "script-exit-code.txt").read_text() == "0"
        evidence = json.loads(
            (logs / "generation-0001" / "generator-evidence.json").read_text()
        )
        assert evidence["prompt_tokens"] == 17 and evidence["output_tokens"] == 29
        assert evidence["selected_skills"] == []
        assert evidence["max_output_tokens"] == 16_000
        assert evidence["reasoning_effort"] == "medium"
        assert evidence["generated_script_count"] == 1
        assert evidence["generated_script_bytes"] == len(solve_mjs.encode())
        assert context.n_input_tokens == 17 and context.n_output_tokens == 29
        assert context.metadata["zx_prompt_solver"][0]["exit_code"] == 0
        assert context.metadata["zx_prompt_solver"][0]["generated_script_count"] == 1

        # Pin zx under the generated bundle ancestor so ESM imports resolve without global state.
        setup_commands: list[str] = []

        class SetupEnvironment:
            async def exec(
                self, command, cwd=None, env=None, timeout_sec=None, user=None
            ):
                setup_commands.append(command)
                assert cwd is None and env is None
                assert timeout_sec == 600 and user == "root"
                return SimpleNamespace(return_code=0, stdout="8.8.5\n", stderr="")

        setup_agent = PromptSkillAgent(
            logs_dir=root / "setup-logs", model_name="fixture/model"
        )
        await setup_agent.setup(SetupEnvironment())
        assert len(setup_commands) == 1
        assert (
            "npm install --prefix /tmp/zx-prompt-solver node@22.14.0 zx@8.8.5"
            in setup_commands[0]
        )
        assert "npm install -g" not in setup_commands[0]
        assert (
            "/tmp/zx-prompt-solver/node_modules/.bin/node "
            "/tmp/zx-prompt-solver/node_modules/.bin/zx --version" in setup_commands[0]
        )

        # Prove a Harbor-injected candidate replaces only the fixed system contract.
        injected_logs = root / "injected-logs"
        injected_logs.mkdir()
        injected_events: list[str] = []
        injected_contract = "candidate-contract-sentinel-548782d4\n"
        catalog_text = (
            Path(__file__).resolve().parent.parent
            / "references"
            / "solver-skills"
            / "catalog.json"
        ).read_text()

        class ContractEnvironment:
            async def exec(
                self, command, cwd=None, env=None, timeout_sec=None, user=None
            ):
                assert cwd is None and env is None
                assert timeout_sec == 30 and user == "root"
                if command.endswith("/references/generator-contract.md"):
                    injected_events.append("contract")
                    return SimpleNamespace(
                        return_code=0, stdout=injected_contract, stderr=""
                    )
                assert command.endswith("/references/solver-skills/catalog.json")
                injected_events.append("catalog")
                return SimpleNamespace(return_code=0, stdout=catalog_text, stderr="")

        async def injected_completion(**kwargs):
            assert injected_events == ["contract", "catalog"]
            injected_events.append("completion")
            assert kwargs["model"] == "provider/fixture-model"
            assert kwargs["messages"] == [
                {"role": "system", "content": injected_contract},
                {"role": "user", "content": prompt},
            ]
            content = json.dumps(
                {"skill_markdown": skill_markdown, "solve_mjs": solve_mjs}
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                usage=None,
            )

        injected_agent = PromptSkillAgent(
            logs_dir=injected_logs,
            model_name="fixture-model",
            generator_model_name="provider/fixture-model",
            completion_fn=injected_completion,
            skills_dir="/harbor/skills",
        )
        await injected_agent._load_injected_contract(ContractEnvironment())
        await injected_agent.run(
            prompt,
            FakeEnvironment(event_log=injected_events, label="injected"),
            AgentContext(),
        )
        assert injected_events == [
            "contract",
            "catalog",
            "completion",
            "upload",
            "exec",
        ]
        injected_evidence = json.loads(
            (injected_logs / "generation-0001" / "generator-evidence.json").read_text()
        )
        assert injected_evidence["contract_source"] == "injected"
        assert injected_evidence["selected_skills"] == []

        # Route one matching executable skill without moving the exact prompt into system guidance.
        routed_logs = root / "routed-logs"
        routed_logs.mkdir()
        routed_events: list[str] = []
        routed_prompt = (
            "Use the installed zx-workflow-author skill to scaffold four compact topic workflows "
            "with Codex, Copilot, pi, OpenCode, Open Knowledge Format, jq, rg, fd, git, and know."
        )

        async def routed_completion(**kwargs):
            assert routed_events == []
            routed_events.append("completion")
            assert kwargs["messages"][1] == {
                "role": "user",
                "content": routed_prompt,
            }
            system = kwargs["messages"][0]["content"]
            assert "# Selected reusable skills" in system
            assert "## Skill: compact-topic-workflow-runtime" in system
            assert "process.env.ZX_PROMPT_SKILL_ROOT" in system
            assert (
                "references/solver-skills/compact-topic-workflow-runtime/scripts/install.mjs"
                in system
            )
            assert routed_prompt not in system
            assert kwargs["max_completion_tokens"] == 192
            assert kwargs["extra_body"] == {"reasoning": {"effort": "none"}}
            content = json.dumps(
                {
                    "skill_markdown": skill_markdown,
                    "solve_mjs": runtime_solve_mjs,
                }
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                usage=None,
            )

        routed_agent = PromptSkillAgent(
            logs_dir=routed_logs,
            model_name="gpt-5.6-luna",
            generator_model_name="openrouter/openai/gpt-5.6-luna",
            completion_fn=routed_completion,
        )
        await routed_agent.run(
            routed_prompt,
            FakeEnvironment(event_log=routed_events, label="routed"),
            AgentContext(),
        )
        assert routed_events == ["completion", "upload", "exec"]
        routed_evidence = json.loads(
            (routed_logs / "generation-0001" / "generator-evidence.json").read_text()
        )
        assert [skill["name"] for skill in routed_evidence["selected_skills"]] == [
            "compact-topic-workflow-runtime"
        ]
        assert routed_evidence["system_sha256"] != routed_evidence["contract_sha256"]
        assert routed_evidence["max_output_tokens"] == 192
        assert routed_evidence["reasoning_effort"] == "none"

        # Generic workflow language is insufficient without the compact topic domain anchors.
        assert (
            routed_agent._select_skill_entries(
                "Implement a distributed HTTP service with strict memory and latency limits."
            )
            == []
        )
        audit_prompt = (
            "Audit /root/package-lock.json with offline Trivy. Keep HIGH and CRITICAL "
            "vulnerabilities, extract CVSS scores, and write the requested security CSV."
        )
        assert [
            entry["name"]
            for entry in routed_agent._select_skill_entries(audit_prompt)
        ] == ["security-audit-runtime"]
        log_prompt = (
            "Read dated log files, count ERROR, WARNING, and INFO for today, last 7 and 30 days, "
            "month to date, and total, then write the ordered summary CSV."
        )
        assert [
            entry["name"]
            for entry in routed_agent._select_skill_entries(log_prompt)
        ] == ["log-summary-runtime"]

        # Fail closed before inference when selected skill bytes no longer match their digest.
        async def unexpected_completion(**kwargs):
            raise AssertionError("tampered selected skill reached inference")

        tampered_agent = PromptSkillAgent(
            logs_dir=root / "tampered-skill-logs",
            model_name="gpt-5.6-luna",
            generator_model_name="openrouter/openai/gpt-5.6-luna",
            completion_fn=unexpected_completion,
        )
        skill_root = (
            Path(__file__).resolve().parent.parent / "references" / "solver-skills"
        )
        tampered_agent._skill_catalog = tampered_agent._parse_skill_catalog(
            catalog_text
        )
        tampered_agent._skill_catalog[0]["sha256"] = "0" * 64
        tampered_agent._skill_root = skill_root
        try:
            await tampered_agent.run(
                routed_prompt,
                FakeEnvironment(event_log=[], label="tampered"),
                AgentContext(),
            )
        except ValueError as error:
            assert "invalid or changed" in str(error)
        else:
            raise AssertionError("tampered selected skill was accepted")

        # Reject skill-root access unless it stays beneath the exclusively selected runtime.
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {
                        "skill_markdown": skill_markdown,
                        "solve_mjs": runtime_solve_mjs,
                    }
                )
            )
        except ValueError as error:
            assert "unselected runtime" in str(error)
        else:
            raise AssertionError("unselected runtime access was accepted")
        escaped_runtime = runtime_solve_mjs.replace(
            "/scripts/install.mjs",
            "/scripts/../other/install.mjs",
        )
        selected_runtime = [
            {"name": "compact-topic-workflow-runtime"}
        ]
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {
                        "skill_markdown": skill_markdown,
                        "solve_mjs": escaped_runtime,
                    }
                ),
                selected_skills=selected_runtime,
            )
        except ValueError as error:
            assert "runtime boundary" in str(error)
        else:
            raise AssertionError("selected runtime traversal was accepted")

        # Preserve generation evidence while rejecting the exact malformed frontmatter seen in live smoke tests.
        malformed_logs = root / "malformed-logs"
        malformed_logs.mkdir()

        async def malformed_completion(**kwargs):
            malformed_skill = "---\nname: generated-terminal-solver\ndescription: |\n  Invalid block scalar.\n---"
            content = json.dumps(
                {"skill_markdown": malformed_skill, "solve_mjs": solve_mjs}
            )
            usage = SimpleNamespace(prompt_tokens=3, completion_tokens=5)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                usage=usage,
            )

        malformed_agent = PromptSkillAgent(
            logs_dir=malformed_logs,
            model_name="fixture/model",
            completion_fn=malformed_completion,
        )
        malformed_context = AgentContext()
        try:
            await malformed_agent.run(
                "reject-malformed-frontmatter", FakeEnvironment(), malformed_context
            )
        except ValueError as error:
            assert "frontmatter" in str(error)
        else:
            raise AssertionError("malformed generated skill was accepted")
        evidence = json.loads(
            (malformed_logs / "generation-0001" / "generator-evidence.json").read_text()
        )
        assert evidence["prompt_tokens"] == 3 and evidence["output_tokens"] == 5
        assert evidence["generated_script_count"] == 0
        assert evidence["generated_script_bytes"] is None
        assert (
            malformed_context.n_input_tokens == 3
            and malformed_context.n_output_tokens == 5
        )
        # Ignore target-language calls embedded as source strings while retaining CommonJS rejection.
        embedded_script = (
            "#!/usr/bin/env zx\n"
            "import fs from 'fs';\n"
            "const source = [\n"
            "  '    require(',\n"
            "  '      condition,',\n"
            "  '      message',\n"
            "  '    )'\n"
            "].join('\\n');\n"
            "fs.writeFileSync('/tmp/embedded-source.txt', source);\n"
        )
        setup_agent._validate_bundle(
            json.dumps({"skill_markdown": skill_markdown, "solve_mjs": embedded_script})
        )
        commonjs_script = "#!/usr/bin/env zx\nconst value = require('execa');\nconsole.log(value);\n"
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {"skill_markdown": skill_markdown, "solve_mjs": commonjs_script}
                )
            )
        except ValueError as error:
            assert "undeclared package" in str(error)
        else:
            raise AssertionError("undeclared CommonJS package was accepted")

        missing_import_script = (
            "#!/usr/bin/env zx\n"
            "const result=spawnSync('true');\n"
            "console.log(result.status);\n"
        )
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {
                        "skill_markdown": skill_markdown,
                        "solve_mjs": missing_import_script,
                    }
                )
            )
        except ValueError as error:
            assert "without importing" in str(error)
        else:
            raise AssertionError("unimported spawnSync was accepted")

        trivy_dash_output = (
            "#!/usr/bin/env zx\n"
            "import{spawnSync}from'node:child_process';\n"
            "spawnSync('trivy',['--output','-']);\n"
        )
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {
                        "skill_markdown": skill_markdown,
                        "solve_mjs": trivy_dash_output,
                    }
                )
            )
        except ValueError as error:
            assert "--output -" in str(error)
        else:
            raise AssertionError("Trivy dash output was accepted")

        repeated_trivy_argv = (
            "#!/usr/bin/env zx\n"
            "import{spawnSync}from'node:child_process';\n"
            "spawnSync('trivy',['trivy','fs']);\n"
        )
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {
                        "skill_markdown": skill_markdown,
                        "solve_mjs": repeated_trivy_argv,
                    }
                )
            )
        except ValueError as error:
            assert "repeats trivy" in str(error)
        else:
            raise AssertionError("repeated Trivy argv was accepted")

        task_logs_script = (
            "#!/usr/bin/env zx\n"
            "import{readdirSync}from'node:fs';\n"
            "console.log(readdirSync('/app/logs').length);\n"
        )
        setup_agent._validate_bundle(
            json.dumps(
                {"skill_markdown": skill_markdown, "solve_mjs": task_logs_script}
            )
        )
        root_logs_script = task_logs_script.replace("/app/logs", "/logs")
        try:
            setup_agent._validate_bundle(
                json.dumps(
                    {"skill_markdown": skill_markdown, "solve_mjs": root_logs_script}
                )
            )
        except ValueError as error:
            assert "protected execution boundary" in str(error)
        else:
            raise AssertionError("reserved root logs path was accepted")

        # Reject undeclared packages even when a global zx installation happens to contain them transitively.
        package_logs = root / "package-logs"
        package_logs.mkdir()

        async def package_completion(**kwargs):
            package_script = "#!/usr/bin/env zx\nimport { execa } from 'execa';\nconsole.log(execa);\n"
            content = json.dumps(
                {"skill_markdown": skill_markdown, "solve_mjs": package_script}
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                usage=None,
            )

        package_agent = PromptSkillAgent(
            logs_dir=package_logs,
            model_name="fixture/model",
            completion_fn=package_completion,
        )
        try:
            await package_agent.run(
                "reject-package-import", FakeEnvironment(), AgentContext()
            )
        except ValueError as error:
            assert "undeclared package" in str(error)
        else:
            raise AssertionError("undeclared generated package was accepted")

        # Reject an attempted second-agent call before upload or execution can occur.
        bad_logs = root / "bad-logs"
        bad_logs.mkdir()
        bad_events: list[str] = []

        async def bad_completion(**kwargs):
            bad_events.append("completion")
            bad_script = "#!/usr/bin/env zx\nawait $`codex exec solve this`;\n"
            content = json.dumps(
                {"skill_markdown": skill_markdown, "solve_mjs": bad_script}
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                usage=None,
            )

        bad_agent = PromptSkillAgent(
            logs_dir=bad_logs,
            model_name="fixture/model",
            completion_fn=bad_completion,
        )
        try:
            await bad_agent.run(
                "reject-agent-escape", FakeEnvironment(), AgentContext()
            )
        except ValueError as error:
            assert "protected execution boundary" in str(error)
        else:
            raise AssertionError("agent escape script was accepted")
        assert bad_events == ["completion"]

    print("zx-prompt-solver agent validation passed.")


if __name__ == "__main__":
    asyncio.run(main())
