# Folder Structure

## Proposed Layout

```text
.
|-- AGENTS.md
|-- README.md
|-- specs/
|   |-- README.md
|   |-- architecture/
|   |   `-- folder-structure.md
|   |-- research/
|   |   `-- technology-map.md
|   `-- skills/
|       `-- skill-suite.md
|-- skills/
|   |-- zx-harness-core/
|   |   `-- README.md
|   |-- zx-harness-pi-runner/
|   |   `-- README.md
|   |-- zx-harness-copilot-runner/
|   |   `-- README.md
|   |-- zx-harness-bash-ops/
|   |   `-- README.md
|   `-- zx-harness-orchestrator/
|       `-- README.md
|-- packages/
|   |-- runtime/
|   |   `-- src/
|   `-- adapters/
|       `-- src/
|-- scripts/
|-- fixtures/
|   |-- prompts/
|   `-- workspaces/
`-- examples/
```

## Intent By Area

### `specs/`

Source of truth for architecture, research notes, and skill definitions.

### `skills/`

One directory per skill package or skill family. Early on, these directories hold scoped docs only. Later they can grow into concrete `SKILL.md`, helper assets, examples, and local scripts.

### `packages/runtime/`

Runtime-agnostic orchestration code.

Expected responsibilities:
- run graph and task lifecycle
- execution contracts
- process supervision
- stdout and stderr normalization
- retries, timeouts, cancellation, and artifact capture

### `packages/adapters/`

Provider-specific integrations.

Expected responsibilities:
- `pi-mono` adapter
- `@github/copilot-sdk` adapter
- shell environment helpers
- future transport-specific wrappers

### `scripts/`

Local project scripts for development, smoke tests, fixture setup, and release prep.

### `fixtures/`

Prompt fixtures, sample workspaces, and reproducible inputs for integration tests.

### `examples/`

Minimal end-to-end demonstrations once the runtime exists.

## Architectural Rule

The repository should converge on this dependency direction:

```text
skills -> packages/runtime -> packages/adapters
```

Adapters may depend on runtime contracts, but skills must not embed provider-specific implementation details directly.

## First Implementation Slice

The first working slice should prove four things:

1. `zx` can start a task, capture output, and enforce timeout policy.
2. A `bash` step can be treated as a structured stage, not a raw string only.
3. A `pi-mono` adapter can run in a non-interactive or process-driven mode.
4. A `@github/copilot-sdk` adapter can run a session through a stable wrapper.
