from __future__ import annotations

import shlex
from pathlib import Path, PurePosixPath
from typing import override

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


class RepositoryIssueWorkflowAgent(BaseAgent):
    """Scaffold one injected candidate and let its generated runtime solve the task issue."""

    SUPPORTS_WINDOWS = False
    _INPUT_ROOT = "/tmp/zx-repository-issue-input"
    _SOLVER_ROOT = "/app/solver"
    _REPOSITORY_ROOT = "/app/repository"

    @staticmethod
    @override
    def name() -> str:
        return "zx-repository-issue-workflow"

    @override
    def version(self) -> str:
        return "1.0.0"

    @override
    async def setup(self, environment: BaseEnvironment) -> None:
        # Task images own Node, Git, the stable profile, and the fake runtime agent; setup is inert.
        return None

    @override
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        # Keep the Harbor instruction as one bounded file so task text never becomes shell source.
        if not isinstance(instruction, str) or not instruction.strip():
            raise ValueError("task instruction is empty")
        if len(instruction.encode("utf-8")) > 65_536:
            raise ValueError("task instruction exceeds 65,536 bytes")
        if not self.skills_dir:
            raise ValueError("Harbor must inject the evaluated skill bundle")

        skills_root = PurePosixPath(str(self.skills_dir))
        if not skills_root.is_absolute() or ".." in skills_root.parts:
            raise ValueError("skills_dir must be an absolute container path")
        candidate_root = skills_root / self.name()
        scaffold = candidate_root / "scripts" / "scaffold-repository-issue-workflow.mjs"

        local_input = self.logs_dir / "runtime-input"
        local_input.mkdir(parents=True, exist_ok=False)
        (local_input / "issue.md").write_text(instruction, encoding="utf-8", newline="\n")
        await environment.upload_dir(source_dir=local_input, target_dir=self._INPUT_ROOT)

        # Scaffold from stable task-owned repository evidence, then commit only the dynamic issue file.
        # Every interpolated value is a validated fixed path and is quoted before Harbor's shell boundary.
        command = " && ".join(
            [
                (
                    f"node {shlex.quote(str(scaffold))} "
                    "/opt/zx-evaluation/repository-profile.json "
                    f"{self._SOLVER_ROOT} --skill-library /opt/zx-evaluation/skill-library"
                ),
                f"install -m 0400 {self._INPUT_ROOT}/issue.md {self._REPOSITORY_ROOT}/issue.md",
                f"git -C {self._REPOSITORY_ROOT} add issue.md",
                (
                    f"git -C {self._REPOSITORY_ROOT} -c user.name='Harbor Runtime' "
                    "-c user.email='runtime@example.invalid' commit -m 'Add runtime issue'"
                ),
                (
                    f"node {self._SOLVER_ROOT}/solve-issue.mjs "
                    f"--root {self._REPOSITORY_ROOT} --issue-file issue.md"
                ),
            ]
        )
        result = await environment.exec(
            command=command,
            cwd="/app",
            env={
                "NO_COLOR": "1",
                "ZX_ISSUE_PI_COMMAND": "/usr/local/bin/node",
                "ZX_ISSUE_PI_PREFIX_JSON": '["/opt/zx-evaluation/fake-pi.mjs"]',
            },
            timeout_sec=900,
        )

        # Candidate failures remain verifier failures; preserve bounded native evidence without rerunning.
        (self.logs_dir / "workflow-stdout.txt").write_text(
            (result.stdout or "")[-1_000_000:], encoding="utf-8"
        )
        (self.logs_dir / "workflow-stderr.txt").write_text(
            (result.stderr or "")[-1_000_000:], encoding="utf-8"
        )
        (self.logs_dir / "workflow-exit-code.txt").write_text(
            str(result.return_code), encoding="utf-8"
        )
        metadata = dict(context.metadata or {})
        metadata["zx_repository_issue_workflow"] = {
            "exit_code": result.return_code,
            "candidate_root": str(candidate_root),
        }
        context.metadata = metadata
