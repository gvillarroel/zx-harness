#!/usr/bin/env python3

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from types import SimpleNamespace

from harbor.models.agent.context import AgentContext
from repository_issue_agent import RepositoryIssueWorkflowAgent


async def main() -> None:
    # Exercise the candidate-injection boundary without Docker, model calls, or task-specific writes.
    with tempfile.TemporaryDirectory(prefix="zx-repository-issue-agent-") as temporary:
        root = Path(temporary)
        logs = root / "logs"
        logs.mkdir()
        instruction = "runtime-issue-sentinel-6ecbf25f"
        events: list[str] = []

        class FakeEnvironment:
            async def upload_dir(self, source_dir, target_dir) -> None:
                events.append("upload")
                assert target_dir == "/tmp/zx-repository-issue-input"
                assert (Path(source_dir) / "issue.md").read_text() == instruction

            async def exec(
                self, command, cwd=None, env=None, timeout_sec=None, user=None
            ):
                events.append("exec")
                assert instruction not in command
                assert cwd == "/app" and timeout_sec == 900 and user is None
                assert env == {
                    "NO_COLOR": "1",
                    "ZX_ISSUE_PI_COMMAND": "/usr/local/bin/node",
                    "ZX_ISSUE_PI_PREFIX_JSON": '["/opt/zx-evaluation/fake-pi.mjs"]',
                }
                assert (
                    "node /harbor/skills/zx-repository-issue-workflow/scripts/"
                    "scaffold-repository-issue-workflow.mjs" in command
                )
                assert "--issue-file issue.md" in command
                assert "git -C /app/repository add issue.md" in command
                return SimpleNamespace(
                    return_code=0,
                    stdout='{"status":"applied"}\n',
                    stderr="",
                )

        context = AgentContext()
        agent = RepositoryIssueWorkflowAgent(
            logs_dir=logs,
            model_name="fixture/runtime-pi",
            skills_dir="/harbor/skills",
        )
        await agent.run(instruction, FakeEnvironment(), context)
        assert events == ["upload", "exec"]
        assert (logs / "workflow-exit-code.txt").read_text() == "0"
        assert context.metadata["zx_repository_issue_workflow"]["exit_code"] == 0
        assert context.metadata["zx_repository_issue_workflow"]["candidate_root"] == (
            "/harbor/skills/zx-repository-issue-workflow"
        )

        # Empty instructions and non-absolute injected skill roots fail before touching an environment.
        try:
            await agent.run("", FakeEnvironment(), AgentContext())
        except ValueError as error:
            assert "empty" in str(error)
        else:
            raise AssertionError("empty instruction was accepted")

        invalid = RepositoryIssueWorkflowAgent(
            logs_dir=root / "invalid",
            model_name="fixture/runtime-pi",
            skills_dir="relative/skills",
        )
        try:
            await invalid.run("issue", FakeEnvironment(), AgentContext())
        except ValueError as error:
            assert "absolute" in str(error)
        else:
            raise AssertionError("relative skills_dir was accepted")

    print("zx-repository-issue-workflow Harbor agent validation passed.")


if __name__ == "__main__":
    asyncio.run(main())
