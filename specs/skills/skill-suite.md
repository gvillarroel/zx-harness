# Skill Suite Spec

## Goal

Build a small group of composable skills that use `zx` as a harness to run richer task workflows across:

- `bash`
- `pi-mono`
- `@github/copilot-sdk`

The skills should enable more complex task execution than a single-agent or single-shell flow can provide on its own.

## Design Principle

Each skill should describe:

- when it should be used
- what inputs it expects
- what runtime it delegates to
- what artifacts it produces
- what failure modes it must surface

## Proposed Skill Groups

### `zx-harness-core`

Responsibility:
- common task framing
- shared vocabulary for stages, artifacts, outputs, retries, and failure states
- reusable execution rules

Likely future contents:
- `SKILL.md`
- task schema examples
- execution contract notes

### `zx-harness-bash-ops`

Responsibility:
- shell-heavy tasks
- pipelines, grep/find flows, environment setup, and scriptable CLI compositions

Guardrails:
- require explicit shell choice
- define quoting expectations
- capture stdout, stderr, exit code, and elapsed time

### `zx-harness-pi-runner`

Responsibility:
- run tasks through `pi-mono`
- support CLI, RPC, or SDK-backed execution depending on maturity

Expected use cases:
- coding-agent style tasks
- project-aware file operations
- skill-aware agent flows

### `zx-harness-copilot-runner`

Responsibility:
- run tasks through `@github/copilot-sdk`
- manage session creation, prompt submission, permission policy, and result collection

Expected use cases:
- tool-using agent tasks where JSON-RPC session control is desirable
- embedding Copilot-driven workflows into repeatable scripts

### `zx-harness-orchestrator`

Responsibility:
- compose multiple stages into one higher-order task
- choose runtime per stage
- normalize outputs into one result envelope

Example future flow:

1. Prepare workspace with `bash`
2. Ask `pi-mono` to inspect or modify files
3. Ask Copilot SDK to review, compare, or continue from artifacts
4. Summarize all outputs into one final report

## Runtime Contract

Every stage should eventually normalize to a shared result shape similar to:

```ts
type StageResult = {
  stageId: string
  runtime: "bash" | "pi" | "copilot"
  ok: boolean
  exitCode?: number | null
  startedAt: string
  finishedAt: string
  stdout?: string
  stderr?: string
  artifacts?: string[]
  metadata?: Record<string, unknown>
}
```

This does not need to be final yet, but the repository should design toward a stable stage envelope.

## Non-Goals For The First Slice

- building a full UI
- implementing plan mode
- solving multi-user scheduling or distributed execution
- locking into only one agent provider

## First Deliverables After Specs

1. A runtime contract document for stage execution.
2. One executable `zx` smoke test that runs a `bash` stage.
3. One spike for `pi-mono` invocation.
4. One spike for `@github/copilot-sdk` session invocation.
