---
adr: "0005"
title: "ADR 0005: Gate Workflow Evolution With Native Harbor Evidence"
summary: "Use immutable baselines, metric-level Harbor tasks, and untouched holdouts to optimize generated workflows."
status: "Accepted"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - evolution
  - zx
  - verification
---

# ADR 0005: Gate Workflow Evolution With Native Harbor Evidence

## Status

Accepted

## Context

Generated workflows can pass one fixture while regressing rollback, context cost, determinism, or
secret safety. Editing the generator from anecdotal failures also risks overfitting.

## Decision

Publish `zx-workflow-evolver`. It freezes each baseline, evaluates bounded mutations with Harbor
0.18.0, separates development, validation, and holdout task families, and promotes only complete,
comparable, non-regressing evidence.

Bundle one native smoke task with an oracle solution and hidden cases for retry routing, gate
feedback, TF-IDF caps, path confinement, redaction, deterministic artifacts, and byte-exact rollback.
Use metric-level rewards and preserve native Harbor artifacts.

## Consequences

Positive:

- optimization claims remain reproducible and auditable
- efficiency cannot hide correctness or safety regressions
- the reference script proves the task is solvable

Negative:

- live evolution requires multiple isolated tasks and model trials
- Docker is required for the native smoke job
- holdout cases must remain unavailable during candidate selection
