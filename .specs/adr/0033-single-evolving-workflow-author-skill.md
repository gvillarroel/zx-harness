---
adr: "0033"
title: "ADR 0033: Publish One Evolving Workflow Author Skill"
summary: "Fold agent orchestration, reviews, and evolution lessons into one runtime-problem workflow author."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Product"
tags:
  - skills
  - zx
  - agents
  - orchestration
  - evolution
---

# ADR 0033: Publish One Evolving Workflow Author Skill

## Context

The repository split workflow authoring, repository issues, prompt benchmarks, evolution, and dataset
authoring into separate skills. That packaging obscured the product: generate a program that receives
a new problem at runtime and composes the known tools needed to solve and verify it.

## Decision

Publish only `zx-workflow-author`. It generates one standalone `solve.mjs` entrypoint plus declarative
data and runtime support. The entrypoint accepts a runtime problem, reduces evidence, invokes fresh
producer and reviewer contexts through tested shell-free adapters, injects only context-selected
digest-bound skills, gates candidates, retries with rejection evidence, and rolls back failure.

Issue triage, issue resolution, code review, and later software-engineering problem types are
composition modes of this skill. Each mode generates a purpose-built program; none becomes another
published skill.

Treat benchmark, evaluation, and evolution work as evidence that improves this skill's composition
policy. Do not publish those activities, providers, or problem classes as sibling skills. Keep sealed
evaluation material outside the product repository.

This decision supersedes ADRs 0012, 0020, 0021, 0030, and 0032 as current product packaging. It
preserves their useful isolation, provenance, routing, and independent-validation lessons inside the
single authoring contract. ADR 0023's single generated entrypoint remains aligned.

## Consequences

- Discovery has one unambiguous skill.
- Generated programs, rather than task-specific skill packages, solve runtime problems.
- Codex, Copilot, pi, OpenCode, and future agents share one inspected adapter contract.
- Producer, reviewer, skill, gate, retry, and recovery choices can evolve without multiplying products.
- Evaluation infrastructure and specialized datasets no longer ship as user-facing skills.
