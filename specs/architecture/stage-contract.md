# Stage Contract

## Purpose

Define one normalized execution contract that all runtimes can target:

- `bash`
- `pi-mono`
- `@github/copilot-sdk`

This keeps orchestration code independent from runtime-specific response shapes.

## Core Model

```ts
type RuntimeKind = "bash" | "pi" | "copilot"

type StageStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"

type StageRequest = {
  stageId: string
  runtime: RuntimeKind
  label: string
  cwd?: string
  timeoutMs?: number
  env?: Record<string, string>
  input: Record<string, unknown>
}

type StageArtifact = {
  kind: "file" | "directory" | "log" | "json" | "text"
  path?: string
  description?: string
  data?: string
}

type StageResult = {
  stageId: string
  runtime: RuntimeKind
  status: StageStatus
  ok: boolean
  startedAt: string
  finishedAt: string
  durationMs: number
  exitCode?: number | null
  stdout?: string
  stderr?: string
  message?: string
  artifacts: StageArtifact[]
  metadata: Record<string, unknown>
}
```

## Runtime Mapping

### `bash`

Typical request input:

```ts
{
  script: string
  shell: "bash"
  args?: string[]
}
```

Mapping notes:
- `exitCode` should come from the process result
- `stdout` and `stderr` are direct process streams
- `timed_out` should be emitted if the harness kills the process after `timeoutMs`

### `pi`

Typical request input:

```ts
{
  mode: "cli" | "rpc" | "sdk"
  prompt: string
  model?: string
  attachments?: string[]
}
```

Mapping notes:
- `stdout` may contain rendered text for CLI mode
- structured event data should go into `metadata`
- adapter should expose session identifiers in `metadata`

### `copilot`

Typical request input:

```ts
{
  prompt: string
  model?: string
  sessionId?: string
  attachments?: string[]
  streaming?: boolean
}
```

Mapping notes:
- final assistant output should be normalized into `stdout` or `message`
- event streams, tool calls, and session metadata should go into `metadata`
- permission policy decisions should also be recorded in `metadata`

## Orchestrator Rules

1. The orchestrator must only consume `StageRequest` and `StageResult`.
2. Adapters may keep richer native objects internally, but they must publish normalized results.
3. Every stage must emit timestamps and duration.
4. Every failed stage must include either `stderr`, `message`, or both.
5. Artifact creation should be explicit, not inferred later from ad hoc files.

## Error Policy

### Expected Failures

Examples:
- shell command exits non-zero
- Copilot session denied permission
- pi runtime returns a known tool failure

Handling:
- return `ok: false`
- preserve available output
- avoid throwing away partial artifacts

### Unexpected Failures

Examples:
- adapter crashes
- invalid request shape
- runtime unavailable

Handling:
- return `status: "failed"`
- set `message` with a short normalized summary
- include adapter-specific error details under `metadata.error`

## Open Design Questions

1. Should `stdout` be required for all successful text-producing stages?
2. Should agent event streams be preserved as artifacts instead of metadata for large sessions?
3. Do we want a separate `review` runtime later, or should that remain a stage intent on top of existing runtimes?
