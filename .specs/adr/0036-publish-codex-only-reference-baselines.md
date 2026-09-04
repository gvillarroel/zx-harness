---
adr: "0036"
title: "ADR 0036: Publish Aggregate Codex-Only Reference Baselines"
summary: "Retain private native evidence and publish immutable aggregate references for future paired evaluations."
status: "Accepted"
date: "2026-09-03"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - codex
  - evaluation
  - provenance
  - privacy
---

# ADR 0036: Publish Aggregate Codex-Only Reference Baselines

## Context

Workflow-contract tests cannot measure direct Codex problem solving: their verifiers require internal
`zx-workflow-author` receipts. Future system comparisons still need durable direct-solve reference
numbers without publishing tasks, prompts, solutions, verifiers, patches, or trajectories.

## Decision

Measure Codex-only performance on released real development tasks with official strategy-independent
verifiers. Bind each result to native job, task, prompt, runner, agent, model, and execution-policy
digests. Inject no candidate or project skill and forbid nested agents. Built-in system skill
descriptions may remain visible, but a reference is valid only when no named skill is invoked.
Provider or infrastructure failures are non-evaluable.

Keep native jobs, locks, reports, and study ledgers private. Publish only the organizer's allowlisted
index and reviewed aggregate tables. Bind each row to a comparison profile, task-set digest, source
report digest, coverage fields, and explicit limitations. Record missing measurements as `n/a`.

Every published reference row is descriptive. A causal comparison requires a contemporary control
with identical, fully enumerated locks except for one digest-bound `zx-workflow-author` injection.
Treatment accounting includes every outer and nested model call; incomplete coverage forbids exact
efficiency or Pareto claims. Repeated runs of one task are replicates, not independent task samples.

## Consequences

- Future evaluations have immutable operational references without exposing evaluation content.
- Contract conformance and end-to-end problem solving remain separate estimands.
- Stable model names do not imply stable backends, so paired controls remain necessary.
- New measurements use new append-only studies; published rows are never rewritten in place.
