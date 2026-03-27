# Technology Map

## Scope

This document records the technologies under consideration, why they fit the repository, and which documentation should be treated as canonical.

## Primary Stack

### `zx`

Role:
- primary scripting harness
- process execution and orchestration layer
- safe argument escaping and shell integration

Why it fits:
- top-level `await` and JavaScript ergonomics are better than raw shell for multi-stage task flows
- built-in helpers like `$`, `within()`, `retry()`, `tmpdir()`, `fetch()`, `glob()`, and shell switching reduce boilerplate
- explicit `useBash()` support is useful because `bash` is a planned execution target

Canonical docs:
- https://google.github.io/zx/
- https://github.com/google/zx
- https://raw.githubusercontent.com/google/zx/main/docs/getting-started.md
- https://raw.githubusercontent.com/google/zx/main/docs/api.md

Important topics to read first:
- command execution with `$`
- `ProcessPromise` and `ProcessOutput`
- `nothrow`, `timeout`, `signal`, and `cwd`
- `within()` for scoped execution context
- `useBash()` and quoting behavior

### `bash`

Role:
- shell-native execution substrate for pipelines, redirection, environment setup, and command composition

Why it fits:
- some tasks are naturally expressed as shell pipelines rather than JS control flow
- it remains the lowest-common-denominator target for many CLI workflows

Canonical docs:
- https://www.gnu.org/software/bash/manual/bash.html

Important topics to read first:
- shell syntax
- quoting
- pipelines
- lists of commands
- shell parameters and expansions
- redirections
- exit status

### `pi-mono`

Role:
- embeddable agent runtime and coding-agent ecosystem
- likely target for one adapter path

Why it fits:
- the coding agent already exposes a CLI, an SDK path, RPC mode, and a customization model around skills and extensions
- it is intentionally minimal and composable, which aligns with this repository's harness-first design

Canonical docs:
- https://github.com/badlogic/pi-mono
- https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- https://www.npmjs.com/package/@mariozechner/pi-coding-agent

Important topics to read first:
- programmatic usage
- RPC mode
- built-in tools and tool selection
- context files and skill loading
- package and extension model

Notes:
- `pi-mono` appears to be the monorepo name.
- `@mariozechner/pi-coding-agent` is the direct package for the coding harness.

### `@github/copilot-sdk`

Role:
- second agent runtime path
- programmable access to GitHub Copilot CLI workflows over JSON-RPC

Why it fits:
- exposes sessions, tool hooks, streaming, permission handling, custom tools, and custom commands
- offers a clean adapter boundary for higher-level orchestration driven by this repository

Canonical docs:
- https://github.com/github/copilot-sdk
- https://github.com/github/copilot-sdk/tree/main/nodejs
- https://www.npmjs.com/package/@github/copilot-sdk

Important topics to read first:
- `CopilotClient`
- session lifecycle
- permission handling
- custom tools and commands
- custom providers
- infinite sessions and session persistence

Notes:
- the SDK currently depends on Copilot CLI being installed separately
- the Node.js SDK is in technical preview, so adapter isolation is important

## Initial Technology Decisions

### Decision 1

Use `zx` as the top-level harness instead of writing the first layer directly against Node `child_process`.

Reason:
- it gives better defaults for process orchestration while preserving shell access

### Decision 2

Treat `pi-mono` and `@github/copilot-sdk` as sibling adapters, not as competing foundations.

Reason:
- the repository goal is orchestration across runtimes, not commitment to one runtime only

### Decision 3

Model `bash` as a structured execution stage with policy around shell selection, quoting, working directory, and exit handling.

Reason:
- uncontrolled shell strings are the fastest path to brittle harness behavior

## Open Questions

1. Should the first adapter target `pi` CLI process execution or the `@mariozechner/pi-coding-agent` SDK directly?
2. Should Copilot sessions be ephemeral by default or persisted for resumability?
3. How much of shell approval and policy belongs in runtime contracts versus adapter-specific policy?
4. Do we want a single normalized event stream across both agent runtimes from day one?
