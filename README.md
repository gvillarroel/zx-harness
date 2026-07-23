# zx-harness

Small, inspectable zx examples for agent-driven workflows.

`zx-harness` is a repo of minimal examples, skills, and evaluation assets for scripting-first automation with Node.js, zx, shell commands, and CLI agent SDKs.

## Why

- keep examples small
- keep execution explicit
- keep dependencies local to each example
- make agent workflows easy to inspect, copy, and evolve

## Start Here

- [Docs index](docs/README.md)
- [Project overview](docs/project.md)
- [Architecture](docs/architecture.md)
- [Example catalog](docs/examples.md)
- [Development guide](docs/development.md)
- [Windows setup](docs/window.md)
- [Specification](SPEC.md)

## Repository Map

| Path | Purpose |
| --- | --- |
| `examples/` | Runnable isolated examples |
| `skills/` | Skills that help agents author examples |
| `evaluations/` | Skill evaluation assets and reports |
| `docs/` | Project documentation |
| `SPEC.md` | Repository contract |

## Quick Start

Install `zx`.

```bash
pnpm install zx
```

Run the smallest example.

```bash
zx examples/hello-world/index.mjs
```

Run the prompt example.

```bash
zx examples/hello-name/index.mjs
```

## Main Examples

| Example | Purpose | Notes |
| --- | --- | --- |
| `examples/hello-world` | Smallest zx entrypoint | fixed baseline |
| `examples/hello-name` | Reads input and prints a greeting | interactive |
| `examples/hello-cop` | Calls Copilot CLI | requires `copilot` |
| `examples/gh-involved-repos` | Lists repos involving the current GitHub user | requires `gh` auth |
| `examples/gh-issue-knowledge` | Investigates one GitHub issue with Codex and optional Brave data | requires `gh` and `codex` |
| `examples/danger-pr-file-limit` | Simulates Danger PR file-limit results | requires `node` |
| `examples/copilot-sdk-repo-summary` | Summarizes a repo with Copilot SDK | local `npm install` |
| `examples/pi-mono-repo-summary` | Summarizes a repo with pi-mono SDK | local `npm install` |
| `examples/jira-open-tickers-acli` | Jira helper material | partial example asset |

See [docs/examples.md](docs/examples.md) for inputs, dependencies, and run commands.

## Example Commands

```bash
zx examples/hello-world/index.mjs
zx examples/gh-involved-repos/index.mjs
zx examples/gh-issue-knowledge/index.mjs owner/repo 123
zx examples/danger-pr-file-limit/index.mjs
```

Repo summary examples need local dependencies first.

```bash
cd examples/copilot-sdk-repo-summary
npm install
zx index.mjs https://github.com/github/copilot-sdk/tree/main/nodejs
```

```bash
cd examples/pi-mono-repo-summary
npm install
zx index.mjs https://github.com/badlogic/pi-mono
```

## Optional Environment

`gh-issue-knowledge` supports optional local source hints.

```bash
ISSUE_KNOWLEDGE_REPO_DIR=/path/to/repo
ISSUE_KNOWLEDGE_DIRS=/path/one:/path/two
ISSUE_KNOWLEDGE_BRAVE_BIN=/path/to/brave-search-cli
ISSUE_KNOWLEDGE_CONFLUENCE_HINT="Search space ENG for team notes"
ISSUE_KNOWLEDGE_BRAVE_HINT="Use Brave MCP server if configured"
ISSUE_KNOWLEDGE_EXTRA_SOURCES="Also inspect exported docs in /path/three"
ISSUE_KNOWLEDGE_VERBOSE=1
```

## Design Rules

- one example per folder
- `index.mjs` is the entrypoint
- each example validates required external CLIs
- example-specific files stay inside the example folder
- output-facing text stays in English

The full contract lives in [SPEC.md](SPEC.md).
