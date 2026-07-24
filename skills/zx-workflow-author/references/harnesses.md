# Harness Selection

## Route

| Work | Route |
| --- | --- |
| list, fetch, parse, schema, exact transform | static command |
| lexical relevance over many local files | local TF-IDF |
| bounded extraction or classification | fast model, low reasoning |
| summarize reduced evidence | fast model |
| multi-file design or code repair | stronger coding model |
| retry after structural gate failure | stronger model with gate output |

Do not send a full repository when a static ranker can select evidence.

## GitHub Copilot SDK

Use `@github/copilot-sdk`. Create one client and one session per workflow stage. Set a stable
session ID, explicit model, and no model tools unless the plan requires them. Read content from
`response?.data.content`, disconnect the session, and stop the client.

Use Copilot when the target environment already has Copilot authentication or needs a coding-agent
session.

## pi SDK

Use `@earendil-works/pi-ai`. Build a model collection with `builtinModels()`, resolve the explicit
provider/model pair, call `models.complete`, and join only text blocks. Record usage metadata when
available.

Use pi when cross-provider routing, local model selection, or provider fallback matters.

## CLI Fallback

When an SDK cannot be installed, author a command stage around the exact harness CLI. Require
machine-readable or file output and gate it like any other command. Never parse interactive ANSI
output.

For topic knowledge, use the ordered `processor.harnesses` command protocol. A harness can be a CLI
or a thin executable wrapper around any SDK. It receives an immutable batch manifest and an isolated
OKF candidate through argument placeholders and `TOPIC_KNOWLEDGE_*` environment variables. Probe
availability before selection, pass arguments without a shell, and keep prior concepts immutable.

Use built-in `codex`, `copilot`, `pi`, or `opencode` presets when those CLIs are installed. Run
`--probe-harnesses --auto-harness` to inspect versions and required flags without a model call. Keep
discovery opt-in; use `--harness <id>` for deterministic routing. On Windows, launch `.ps1` shims
through PowerShell's `-File` argument boundary and reject command-only `.cmd` adapters.

## Token Controls

- cap every input independently
- prefer structured JSON over prose
- strip generated, binary, vendor, and cache paths before ranking
- reuse static artifacts across retries
- send only candidate output and gate diagnostics on retry
- escalate models only after a measurable failure
