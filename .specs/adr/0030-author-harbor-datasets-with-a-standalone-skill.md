---
adr: "0030"
title: "ADR 0030: Author Harbor Datasets with a Standalone Skill"
summary: "Add a reusable authoring bundle while keeping probes local and study evidence external."
status: "Superseded"
superseded_by: "0033"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - datasets
  - validation
  - skills
---

# ADR 0030: Author Harbor Datasets with a Standalone Skill

## Context

The repository ships small Harbor probes inside owning skill bundles, while
larger development and sealed evaluation cohorts are external study inputs.
Creating variants directly inside an evolution run would make split membership,
response conventions, and verifier behavior difficult to audit.

## Decision

Add `harbor-author-evaluation-datasets` as a standalone product skill. Use it
before study registration to assign semantic families to disjoint discovery,
development, sealed validation, and optional holdout cohorts and to materialize
task-keyed seeded nuisance variants.

Keep existing smoke probes inside their owning bundles. Keep private blueprints,
seeds, rendered task roots, solutions, verifiers, jobs, traces, and diagnostics
outside this repository and outside candidate-visible workspaces. The new skill
does not run Harbor, score results, register datasets, or release sealed
cohorts; those responsibilities remain with their owning tools.

After the owning release boundary, the bundle may consume finalized
schema-version-1 `harbor-run-results` reports and emit aggregate-only JSON,
Markdown, and static SVG comparisons. Those views expose correctness, errors,
tokens, reported cost, agent time, wall time, throughput, and source hashes;
they do not reparse raw jobs, replace native evidence, or make unlike task
locks, agents, models, cache policies, or hardware comparable.

## Consequences

- Dataset construction becomes reproducible and independently auditable.
- Evolution may use only development evidence; validation opens after one
  candidate is frozen, and holdout remains an optional later gate.
- Existing probes and historical evidence paths do not move.
- The repository remains a collection of independently copyable skills rather
  than a second evaluation runtime.
- Validation or holdout aggregates never feed the same study's evolution loop.
