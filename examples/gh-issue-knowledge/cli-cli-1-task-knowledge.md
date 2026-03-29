# cli/cli#1

## Issue

`cli/cli#1` is not an open issue. It is the first pull request: [`cli/cli#1`](https://github.com/cli/cli/pull/1), titled `interactive pr list`, created on October 4, 2019 and merged the same day.

The PR added a default interactive flow to bare `gh pr`. It collected:

- the PR for the current branch
- PRs created by the viewer
- PRs requesting the viewer's review

It then showed a selector with three actions:

- open in browser
- checkout PR locally
- cancel

The author called out three known gaps in the PR body:

- no visual split between PR groups
- no explanation of what the list contents represent
- no close action yet

## Repository Findings

PR #1 changed one file only: `command/pr.go`, with `+82` and `-0`.

The implementation was a thin prototype:

- it added a `Run` handler directly on the root `pr` command
- it reused existing `pullRequests()` and `checkoutPr()` plumbing
- it opened the browser via `utils.BrowserLauncher()`
- it had no tests in the PR metadata or diff

There is one likely correctness risk in the original patch: the displayed option list was deduplicated by PR number, but the follow-up action indexed back into the original `prs` slice. If duplicates existed across the three source lists, the selected menu index could point at the wrong PR.

The feature did not remain the long-term model. By May 19, 2020, [`cli/cli#964`](https://github.com/cli/cli/pull/964) shows `command/pr.go` already had a distinct `Short: "Show status of relevant pull requests"` entry alongside other `pr` subcommands. That is strong evidence the product had moved from a default interactive root command to explicit subcommands very early.

Current `trunk` confirms that shift:

- [`pkg/cmd/pr/pr.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/pr.go) defines grouped subcommands and no root `Run`
- [`pkg/cmd/pr/status/status.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/status/status.go) now implements the same core concept as a structured summary: `Current branch`, `Created by you`, and `Requesting a code review from you`

So the original intent survived, but the UX changed from interactive selection on `gh pr` to a dedicated `gh pr status` command plus targeted commands like `gh pr view`, `gh pr checkout`, and `gh pr close`.

## External Findings

Current public docs align with the modern command model, not the 2019 prototype:

- the manual reference documents `gh pr status`
- the examples page shows `gh pr status` with the same three sections as the current code
- the repository README screenshot highlights `gh pr status` as a headline workflow

This suggests the implementation/triage direction is settled:

- summary and grouping belong in `gh pr status`
- actions belong in dedicated subcommands
- bare `gh pr` is a command group, not an interactive mode

No external API, standards, or upstream bug search materially changed that conclusion.

## Open Questions

- The exact commit or PR that removed the root interactive `gh pr` flow was not identified from the sources used.
- No direct discussion was found explaining why the interactive root UX was dropped, but the current command layout strongly implies a deliberate move toward explicit subcommands.
- The duplicate-selection risk in the original prototype was inferred from the patch. No user report was found confirming it in practice.

## Suggested Next Steps

- Treat `cli/cli#1` as historically implemented but superseded.
- If triaging product intent, map the original goals to current commands:
  - discover relevant PRs: `gh pr status`
  - open one: `gh pr view --web`
  - checkout one: `gh pr checkout`
  - close one: `gh pr close`
- If deeper archaeology is required, inspect git history around `command/pr.go` after October 2019. That may identify the exact removal PR, but it is unlikely to change present implementation decisions.

## Sources

- Local context file `C:/Users/villa/dev/zx-harness/examples/gh-issue-knowledge/run/cli-cli-1-context.json`
  - attempted as starting context, but unreadable in the current shell sandbox, so it produced no usable findings
- GitHub PR: https://github.com/cli/cli/pull/1
- GitHub issue/PR metadata via connector for `cli/cli#1`
- PR #1 patch for `command/pr.go`: https://github.com/cli/cli/pull/1
- Merge commit for PR #1: https://github.com/cli/cli/commit/441a1c97ddb4a0ded078649174ec2e44aca42dde
- Current root PR command: https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/pr.go
- Current PR status command: https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/status/status.go
- Historical evidence of early `pr status` subcommand: https://github.com/cli/cli/pull/964
- Manual reference: https://cli.github.com/manual/gh_help_reference
- Examples page: https://cli.github.com/manual/examples.html
- Repository README: https://github.com/cli/cli/blob/trunk/README.md