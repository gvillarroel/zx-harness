# zx-harness

Small zx harness examples.


## Quick Start
Install zx.
```
pnpm install zx
```

## Run Examples
```
zx examples/hello-world/index.mjs
```

Copilot SDK repository summary example:
```bash
cd examples/copilot-sdk-repo-summary && npm install
zx examples/copilot-sdk-repo-summary/index.mjs https://github.com/github/copilot-sdk/tree/main/nodejs
```

pi-mono SDK repository summary example:
```bash
cd examples/pi-mono-repo-summary && npm install
zx examples/pi-mono-repo-summary/index.mjs https://github.com/badlogic/pi-mono
```

Issue knowledge example:
```bash
zx examples/gh-issue-knowledge/index.mjs owner/repo 123
```

Optional local sources:
```bash
ISSUE_KNOWLEDGE_REPO_DIR=/path/to/repo
ISSUE_KNOWLEDGE_DIRS=/path/one:/path/two
ISSUE_KNOWLEDGE_BRAVE_BIN=/path/to/brave-search-cli
ISSUE_KNOWLEDGE_CONFLUENCE_HINT="Search space ENG for team notes"
ISSUE_KNOWLEDGE_BRAVE_HINT="Use Brave MCP server if configured"
ISSUE_KNOWLEDGE_EXTRA_SOURCES="Also inspect exported docs in /path/three"
ISSUE_KNOWLEDGE_VERBOSE=1
```

## Configure `acli`
Login first.
```bash
acli jira auth login --web
```

Use `ACLI_BIN` when `acli` is exposed by a different command or path.
```bash
ACLI_BIN=/path/to/acli zx examples/jira-open-tickers-acli/index.mjs
```
