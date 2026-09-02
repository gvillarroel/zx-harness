---
adr: "0011"
title: "ADR 0011: Split and Lock Script Evaluations"
summary: "Generate disjoint Harbor cohorts and validate every script-facing risk profile before holdout."
status: "Accepted"
date: "2026-07-26"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - evaluation
  - scripts
  - holdout
---

# ADR 0011: Split and Lock Script Evaluations

## Context

The topic benchmark varied only topics across discovery and holdout. It lacked a validation split,
an explicit selection gate, and a fast command that exercised every generated script profile.

## Decision

Generate two byte-distinct tasks for discovery, development, validation, and holdout. Development
uses Unicode and punctuation inputs, validation uses shell and option-like inputs, and holdout uses
path-like and option-like inputs. Keep each Harbor job inside one split.

Emit a skill-owned stage plan. Holdout depends on a dataset-free candidate selection stage. Validate
task digests, job isolation, exact argv preservation, repeated dry-run determinism, dry-run purity,
functional gates, and the negative byte objective before Harbor execution. Execute holdout profiles
only through an explicit release after candidate selection.

## Consequences

- Candidate changes receive actionable development evidence.
- Selection uses disjoint validation tasks.
- Holdout cannot precede a recorded selection.
- CI exercises optimizer-visible entrypoints and mechanically verifies sealed holdout structure.
