---
adr: "0031"
title: "ADR 0031: Evaluate Repository Workflows on DeepSWE with Pier"
summary: "Add a digest-locked DeepSWE lane without weakening independent validation or task isolation."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - deep-swe
  - pier
  - repository-workflow
  - validation
---

# ADR 0031: Evaluate Repository Workflows on DeepSWE with Pier

## Context

`zx-repository-issue-workflow` needs multilingual, repository-scale evidence beyond its synthetic
Harbor fixture. DeepSWE v1.1 supplies 113 Harbor-format tasks, but its separate verifier requires
Pier newer than 0.3.0 and collects the committed diff from each task repository. Its tasks do not
inject candidate skills through Harbor's `skills_dir` boundary.

## Decision

Use DeepSWE only through a dedicated Pier 0.3.1 adapter owned by
`zx-repository-issue-workflow`. Freeze the DeepSWE source at a full Git commit, preserve every task
byte, pin task images by immutable digest before inference, and keep the corpus and all run evidence
outside Git.

Partition whole `metadata.repository_url` families. A repository may occur in exactly one of
development, sealed validation, or optional holdout. Reuse across issues from one repository is
measured within development; validation measures transfer to unseen repositories.

The fixed adapter verifies the candidate digest, profiles and scaffolds before receiving the issue,
stores the issue below `/app/.git`, runs the frozen workflow in `/app`, and commits only a nonempty
accepted patch. It never reads `/tests`, `/solution`, or verifier state. Pier's job lock plus the
external study receipt must bind the candidate, model, dataset revision, task-tree digests, and image
digests.

DeepSWE does not replace the native Harbor 0.18.0 smoke probe. Pier output may inform development
only after oracle preflight and provenance checks. One candidate is digest-frozen before validation
is released once; validation cannot select or modify it. Holdout remains sealed until a later
explicit release.

## Consequences

- DeepSWE can exercise the permanent repository workflow across TypeScript, Go, Python,
  JavaScript, and Rust projects.
- The benchmark is evaluation evidence, not an optimizer or a source of task-derived workflow
  content.
- Same-repository reuse and unseen-repository generalization remain distinct claims.
- Operational sealing does not establish pretraining non-contamination for a public benchmark.
- Pier/Harbor artifact compatibility must be verified before evidence is consumed by an existing
  evolver; silent conversion or mixed-runtime comparison is forbidden.
- Provider credentials enter only through an operator-supplied pi auth file and never through task
  text, candidate files, job logs, or committed artifacts.
