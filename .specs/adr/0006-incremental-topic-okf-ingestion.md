---
adr: "0006"
title: "ADR 0006: Ingest Topic Knowledge Incrementally Before OKF Publication"
summary: "Use connector-based know synchronization, hash-ledger batches, and validated atomic OKF publication per topic."
status: "Accepted"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Knowledge Workflows"
tags:
  - know
  - okf
  - arxiv
  - incremental
---

# ADR 0006: Ingest Topic Knowledge Incrementally Before OKF Publication

## Status

Accepted

## Context

Topic research must combine arXiv with other sources without reprocessing unchanged documents.
Open Knowledge Format libraries permit incremental concept publication, while Semantic OKF
snapshots require complete atomic rebuilds.

## Decision

Add a standalone topic-knowledge scaffold to `zx-workflow-author`. One `know` key synchronizes all
configured connectors. A SHA-256 ledger selects only unseen content versions for a staged OKF
library. The workflow rebuilds its reserved index, validates through the `open-knowledge-format`
skill, and atomically promotes the candidate.

Keep Semantic OKF materialization outside this incremental loop. Any later semantic projection must
rebuild every declared source and promote a complete validated snapshot.

## Consequences

Positive:

- one script supports arXiv, sites, repositories, feeds, and video
- unchanged documents consume no processing work
- each topic has isolated sources, state, runs, and OKF output
- invalid batches cannot replace the published library

Negative:

- source synchronization may still revisit remote endpoints
- content changes are processed as new digest versions
- OKF and `know` remain explicit external prerequisites
