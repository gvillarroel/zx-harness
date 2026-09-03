---
adr: "0035"
title: "ADR 0035: Bound Workflow Resources and Protected Controls"
summary: "Apply one global resource envelope and digest checks to generated workflow execution."
status: "Accepted"
date: "2026-09-03"
product: "zx-harness"
owner: "Platform Architecture"
area: "Runtime"
tags:
  - budgets
  - controls
  - integrity
  - rollback
---

# ADR 0035: Bound Workflow Resources and Protected Controls

## Context

Per-stage limits do not bound aggregate producer, reviewer, repair, and retry work. Executable gates
can also change during a run, invalidating their authority after plan validation.

## Decision

Accept optional top-level global budgets for agent calls, input tokens, output tokens, and wall time.
When token caps are configured, require complete fail-closed Codex JSONL usage. Start the wall clock
before setup, cap subprocess timeouts by the remaining budget, terminate bounded process groups, and
restore declared mutations after terminal failure.

Accept optional SHA-256-bound protected controls outside producer mutation scope. Verify them before
and after every subprocess. Restore changed controls, record no control content, and terminate with
`protected_control_changed`.

Plans without budgets or protected controls remain valid. G004 development and independent validation
each scored the baseline 1/3 and candidate 3/3, with zero execution errors and zero regressions.

## Consequences

- One envelope bounds all agent activity, including retries and repair.
- Incomplete token accounting cannot support a token-bounded success claim.
- Wall-time exhaustion cannot be bypassed by setup or oversized child timeouts.
- Executable policy drift is restored and fails closed.
- Existing generated plans remain compatible until they opt into either control.
