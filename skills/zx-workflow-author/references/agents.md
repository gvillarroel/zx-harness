# Agent Contexts

An agent adapter names provenance and defines one non-interactive, shell-free process boundary.
Inspect the installed CLI's help; do not infer flags from another version.

## Adapter contract

- `provider`: audit label such as `codex`, `copilot`, `pi`, or `opencode`.
- `command`: executable resolved by the target environment.
- `args`: fixed argv with optional `{model}`, `{prompt}`, `{root}`, or `{runDir}` placeholders.
- `promptMode`: `stdin` by default; `argument` requires `{prompt}` in `args`.
- `resultFormat`: `text` by default, or `codex-jsonl` for metered Codex output.
- `cwd`: optional repository-relative working directory.
- `env`: non-secret configuration only. Credentials remain ambient.
- `timeoutMs`: explicit limit for the process.

Per-process timeouts are subordinate to the plan's remaining wall-time budget. Count every producer
and reviewer launch against `maxAgentCalls`, including failed processes and retries. Reserve the call
before launch so concurrent or failed execution cannot bypass the limit.

Probe availability and non-interactive behavior during authoring. A generated runtime does not select
an untested adapter merely because its executable exists.

## Metered Codex

Use `codex-jsonl` when total workflow cost or nested-agent provenance matters:

```json
{
  "provider": "codex",
  "command": "codex",
  "args": [
    "exec", "--ignore-user-config", "--ephemeral", "--model", "{model}", "--json",
    "--output-last-message", "{lastMessage}", "-"
  ],
  "promptMode": "stdin",
  "resultFormat": "codex-jsonl"
}
```

The runtime gives each call clean temporary `HOME`, `CODEX_HOME`, and `CODEX_SQLITE_HOME` directories.
It exposes only ambient authentication in the Codex home; inherited skills, config, MCPs, sessions,
and databases stay outside the child. `--ignore-user-config` is an `exec` flag and follows `exec`.
`--ephemeral` prevents rollout persistence. The final message remains the candidate.
The runtime bounds that message to 1 MB and removes its redundant per-call file after reading it.

Telemetry retains hashes, byte and event counts, terminal usage, timing, and exit state. It never
persists prompts, reasoning, commands, tool output, thread IDs, raw agent messages, or raw JSONL.

`inputTokens` already includes `cachedInputTokens`; `reasoningOutputTokens` is part of `outputTokens`.
Never add either subset again. Pricing stays
outside the workflow because rates and long-context rules change. If an adapter cannot emit structured
usage, its ledger entry uses `usageCoverage: "unavailable"`; do not claim exact total cost.
Plan-level input and output token limits require complete `codex-jsonl` metering for every used agent.
Apply cumulative usage immediately after each call, before any retry or reviewer can start. If a call
does not yield a complete receipt, record `budget_accounting_incomplete` and stop the workflow.

## Context boundaries

Use a producer for one ambiguous transformation. Its context contains only the runtime problem,
stage prompt, bounded declared inputs, selected skills, route, and prior rejection feedback.

Use a reviewer only when executable gates cannot cover an important semantic property. Start it as a
new process after deterministic gates pass. Its context contains the problem, candidate, declared
evidence, reviewer prompt, and reviewer-specific skills—never the producer conversation.

Configure reviewer adapters in the CLI's read-only or approval-free analysis mode. The runtime also
checkpoints and restores every declared mutation around a review; CLI permissions remain responsible
for blocking undeclared writes.

Prefer heterogeneous reviewers only when their tools or failure modes differ materially. Agreement
between agents is evidence, not truth; executable checks retain higher authority.
