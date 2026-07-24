---
adr: "0004"
title: "ADR 0004: Publish Only Gated zx Workflow Skills"
summary: "Replace repository examples with a skill that generates project-local gated workflows."
status: "Accepted"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Product"
tags:
  - skills
  - zx
  - harnesses
  - gates
---

# ADR 0004: Publish Only Gated zx Workflow Skills

## Status

Accepted

## Context

Fixed examples teach narrow commands but do not help an agent compose repository-specific
automation. The required product is reusable procedural knowledge for combining deterministic
tools, model SDKs, and verification.

## Decision

Publish only skill packages as product artifacts. The first package, `zx-workflow-author`, generates
standalone project-local workflows from declarative plans.

Each workflow collects and reduces evidence with static tools before invoking a harness. Model
output stays staged until an executable gate passes. A failed gate feeds evidence into a bounded
retry, escalates the model only when needed, and restores declared mutations after terminal
failure.

Keep root governance and CI. Remove standalone examples, evaluation history, example documentation,
and Danger experiments.

## Consequences

Positive:

- skills generalize across repositories and task sources
- deterministic work consumes no model tokens
- gates make autonomous retries inspectable
- generated workflows do not depend on this repository

Negative:

- generated plans still require repository-specific commands and gates
- SDK authentication remains an environment concern
- mutation lists must be complete for rollback guarantees
