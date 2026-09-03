---
adr: "0032"
title: "ADR 0032: Catalog Evaluation Datasets by Owning Skill"
summary: "Keep source catalogs with their adapters, assign DeepSWE to repository workflows, and make validation a one-way gate."
status: "Superseded"
superseded_by: "0033"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - datasets
  - harbor
  - deep-swe
  - validation
---

# ADR 0032: Catalog Evaluation Datasets by Owning Skill

## Context

Repository benchmark sources were duplicated in the prompt-solver catalog and
the repository-workflow contract. DeepSWE had a runtime contract but no entry
linking its official source. Older evolver text also let validation select a
candidate, contrary to the maintained independent-validation contract.

## Decision

Keep each source catalog at
`skills/<owner>/references/evaluation-datasets.md`; use
`docs/evaluation-datasets.md` only as a navigation index. Keep public smoke
tasks with their owning bundle and all materialized external cohorts, private
splits, study state, jobs, and evidence outside Git.

Assign DeepSWE to `zx-repository-issue-workflow`. Pin its full source commit,
Pier `0.3.1`, task trees, images, candidate, and model in each study. Partition
normalized `metadata.repository_url` families atomically. Materialize task
directories as regular files because the upstream `tasks/README.md` symlink is
not accepted by the organizer.

Use development as the only split for diagnosis, mutation, ranking, and
selection. Digest-freeze one development-selected candidate before releasing
validation once. Any later mutation requires a new study with fresh
validation. Holdout is an optional third gate after validation.

Bundled public probes may label validation- and holdout-shaped risks, but their
plans and flags must not model organizer release, candidate binding,
acceptance, or promotion. They only expand deterministic smoke coverage.

This release order supersedes the candidate-selection wording in ADRs 0005 and
0011; their smoke-probe and metric decisions remain active.

## Consequences

- Every dataset source has one skill-local owner and one discoverable index.
- DeepSWE is visible without vendoring its public tasks or leaking private
  split membership.
- Existing append-only studies remain in place; incompatible legacy studies
  require new study versions rather than edits or moves.
- Public fixtures validate adapters but cannot support secrecy or
  contamination-free claims.
