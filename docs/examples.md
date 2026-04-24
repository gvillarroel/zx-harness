# Example Catalog

## Summary

Each example is isolated. Runnable examples use `index.mjs` as the entrypoint.

All runnable examples require `zx`.

## Catalog

| Example | Status | Requires | Result |
| --- | --- | --- | --- |
| `hello-world` | runnable | `zx`, `bash.exe` on Windows | prints `hello world` |
| `hello-name` | runnable | `zx`, `bash.exe` on Windows | prints `hello <name>` |
| `hello-cop` | runnable | `zx`, `copilot`, `bash.exe` on Windows | prints provider output |
| `gh-involved-repos` | runnable | `zx`, `gh` auth | prints repo names |
| `gh-issue-knowledge` | runnable | `zx`, `gh`, `codex` | writes a markdown knowledge file |
| `danger-pr-file-limit` | runnable | `zx`, `node` | prints allowed and blocked PR examples |
| `copilot-sdk-repo-summary` | runnable | `zx`, `node`, `npm`, `git`, local `npm install` | prints repo summary |
| `pi-mono-repo-summary` | runnable | `zx`, `node`, `npm`, `git`, local `npm install` | prints repo summary |
| `jira-open-tickers-acli` | partial asset | local TypeScript helper only | no `index.mjs` yet |

## Baseline Examples

These satisfy the baseline contract from [spec.md](spec.md):

- `hello-world`
- `hello-name`
- `gh-involved-repos`
- `hello-cop`

## Per Example

### `hello-world`

Purpose:
smallest fixed `zx` example.

Run:

```bash
zx examples/hello-world/index.mjs
```

Notes:

- uses `bash.exe`
- fixed output

### `hello-name`

Purpose:
argument parsing with interactive fallback.

Run:

```bash
zx examples/hello-name/index.mjs Alice
```

Notes:

- uses `bash.exe`
- prompts when no name argument is given

### `hello-cop`

Purpose:
smallest Copilot CLI-backed example.

Run:

```bash
zx examples/hello-cop/index.mjs
```

Notes:

- uses `bash.exe`
- requires `copilot` on `PATH`

### `gh-involved-repos`

Purpose:
list repositories tied to issues or PRs that involve the authenticated GitHub user.

Run:

```bash
zx examples/gh-involved-repos/index.mjs
```

Notes:

- uses `gh api user` to resolve the current login
- uses `gh search issues --include-prs`

### `gh-issue-knowledge`

Purpose:
investigate one GitHub issue with Codex, optional local source directories, and optional Brave search leads.

Run:

```bash
zx examples/gh-issue-knowledge/index.mjs owner/repo 123
```

Optional environment:

- `ISSUE_KNOWLEDGE_REPO_DIR`
- `ISSUE_KNOWLEDGE_DIRS`
- `ISSUE_KNOWLEDGE_BRAVE_BIN`
- `ISSUE_KNOWLEDGE_CONFLUENCE_HINT`
- `ISSUE_KNOWLEDGE_BRAVE_HINT`
- `ISSUE_KNOWLEDGE_EXTRA_SOURCES`
- `ISSUE_KNOWLEDGE_VERBOSE`

Output:

- `<owner>-<repo>-<issue>-task-knowledge.md` in the example folder
- raw and filtered Brave research files under `examples/gh-issue-knowledge/run/` when Brave is enabled

### `danger-pr-file-limit`

Purpose:
show one PR that passes the Danger file limit and one PR that fails it.

Run:

```bash
zx examples/danger-pr-file-limit/index.mjs
```

Notes:

- reuses `.github/danger-pr-file-limit-rule.mjs`
- does not create GitHub PRs

### `copilot-sdk-repo-summary`

Purpose:
summarize a repository through a local package-backed TypeScript helper.

Install:

```bash
cd examples/copilot-sdk-repo-summary
npm install
```

Run:

```bash
zx examples/copilot-sdk-repo-summary/index.mjs https://github.com/github/copilot-sdk/tree/main/nodejs
```

Environment:

- `COPILOT_REPO_SUMMARY_MODEL`
- `COPILOT_REPO_SUMMARY_REASONING`
- `COPILOT_REPO_SUMMARY_MAX_BYTES`
- `COPILOT_REPO_SUMMARY_CONCURRENCY`
- `COPILOT_REPO_SUMMARY_TIMEOUT_MS`

### `pi-mono-repo-summary`

Purpose:
summarize a repository through a local package-backed TypeScript helper and PI Mono auth.

Install:

```bash
cd examples/pi-mono-repo-summary
npm install
```

Run:

```bash
zx examples/pi-mono-repo-summary/index.mjs https://github.com/badlogic/pi-mono
```

Environment:

- `PI_MONO_REPO_SUMMARY_PROVIDER`
- `PI_MONO_REPO_SUMMARY_MODEL`
- `PI_MONO_REPO_SUMMARY_REASONING`
- `PI_MONO_REPO_SUMMARY_MAX_BYTES`
- `PI_MONO_REPO_SUMMARY_CONCURRENCY`
- `PI_MONO_REPO_SUMMARY_TIMEOUT_MS`
- `PI_MONO_REPO_SUMMARY_API_KEY`

### `jira-open-tickers-acli`

Purpose:
hold a small Jira formatting helper.

Status:

- not a runnable example yet
- does not currently satisfy the example contract because it has no `index.mjs`

## Choosing An Example

- use `hello-world` to verify the smallest `zx` path
- use `hello-name` for a tiny interactive pattern
- use `hello-cop` for a minimal provider CLI call
- use `gh-involved-repos` for a simple authenticated GitHub workflow
- use `gh-issue-knowledge` for a multi-step agent workflow
- use `danger-pr-file-limit` to preview the Danger PR-size check
- use a repo-summary example when local package dependencies are acceptable

## Platform Note

Some examples explicitly set `$.shell = "bash.exe"`. Those examples are documented in [windows.md](windows.md) because they are oriented to Windows with WSL available on `PATH`.
