---
adr: "0009"
title: "ADR 0009: Distill Compact Per-Harness Topic Scripts"
summary: "Replace universal harness discovery with four small wrappers and a negative byte objective."
status: "Accepted"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Knowledge Workflows"
tags:
  - harbor
  - trace-distillation
  - harnesses
  - okf
supersedes:
  - "0006"
  - "0007"
  - "0008"
---

# ADR 0009: Distill Compact Per-Harness Topic Scripts

## Context

The universal topic runtime reached 40,841 bytes and hid four prompt simulations behind adapter
selection. A topic should be the only required input.

## Decision

Generate `codex.mjs`, `copilot.mjs`, `pi.mjs`, and `opencode.mjs` around one shared runtime. Each
wrapper owns a distinct prompt. `know`, `jq`, `rg`, `fd`, and `git` perform deterministic work;
the selected harness sees only new content hashes. The external OKF skill validates staged output
before promotion. Additional harnesses implement the same argument-array wrapper.

Evolve size with:

```text
script_size_negative = -script_size_bytes
```

Set `MAX_SCRIPT_BYTES` explicitly and keep functional rewards as independent gates. Promote only
after same-task development and disjoint Harbor holdouts pass.

## Evidence

Harbor Trace Distillation used two discovery tasks, two new development trials, and two disjoint
holdouts. The largest generated executable fell from 40,841 to 6,365 bytes in the promoted
candidate; mean negative-byte reward improved by 34,476 with zero candidate errors or regressions.

## Consequences

- One topic command selects one visible harness and prompt.
- Shared deterministic logic stays below the declared byte cap.
- Universal automatic selection is removed; explicit wrappers remain extensible.
