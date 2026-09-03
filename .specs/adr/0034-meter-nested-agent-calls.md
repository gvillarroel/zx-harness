---
adr: "0034"
title: "ADR 0034: Meter Nested Agent Calls"
summary: "Record every generated agent process and require structured usage for exact cost claims."
status: "Accepted"
date: "2026-09-03"
product: "zx-harness"
owner: "Platform Architecture"
area: "Runtime"
tags:
  - agents
  - cost
  - codex
  - telemetry
---

# ADR 0034: Meter Nested Agent Calls

## Context

An enclosing harness measures its authoring agent, not assistants launched by a generated workflow.
Nested Codex sessions can also pollute the enclosing session tree. Comparing only outer tokens would
make an orchestrated treatment appear artificially cheap.

## Decision

Record one append-only `model-calls.jsonl` entry for every live producer, reviewer, repair, and retry.
The entry binds context, adapter, model, time, exit state, and available usage.

Codex 0.153 adapters that claim complete usage must use stdin plus `--json`, `--ephemeral`,
`--ignore-user-config`, explicit model routing, and `--output-last-message`. Run each call with clean
temporary `HOME`, `CODEX_HOME`, and `CODEX_SQLITE_HOME` directories. Expose only ambient authentication
in the child Codex home, then delete the exact temporary root after the process settles.

Parse JSONL as a stream. Persist only hashes, byte and event counts, terminal usage, timing, exit state,
and final-message hashes. Never persist prompts, reasoning, commands, tool output, thread identifiers,
raw agent messages, or raw JSONL. Fail closed on malformed streams, fatal events, missing or duplicate
terminal events, invalid usage, or an empty or oversized final message. Bound the final message to 1 MB,
use it as the in-memory candidate, and remove its per-call file before recording telemetry. Treat cached
input as part of input and reasoning output as part of output. Keep pricing outside the runtime.

## Consequences

- Harness and workflow usage can be summed without double-counting cached input.
- Nested Codex calls do not create sessions in the enclosing harness tree.
- Final messages remain distinct from telemetry streams.
- Audit evidence remains useful without duplicating task or tool content.
- Other assistants remain usable, but exact total-cost claims fail when their usage is unavailable.
