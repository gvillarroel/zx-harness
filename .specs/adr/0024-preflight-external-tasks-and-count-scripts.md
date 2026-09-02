---
adr: "0024"
title: "ADR 0024: Preflight External Tasks and Count Generated Scripts"
summary: "Reject broken evaluation tasks before inference and require one generated executable."
status: "Accepted"
date: "2026-09-01"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - datasets
  - zx
  - scripts
---

# ADR 0024: Preflight External Tasks and Count Generated Scripts

## Context

External Harbor datasets vary in image availability, oracle health, task naming, and local versus
registry configuration. A broken oracle or inaccessible image can look like solver failure. Script
size alone also permits an implementation to hide complexity across extra executable files.

## Decision

Admit an external task only after its task-owned oracle returns reward `1` without an exception in
the pinned Harbor version. Bind its package version and task checksum; bind the image digest when
available. Local task paths use Harbor `tasks`; registry packages use `datasets`. Provider, registry,
authentication, timeout, and infrastructure failures remain non-evaluable.

Require every prompt-compiled bundle to contain one executable source, `scripts/solve.mjs`, and expose
`generated_script_count = 1`. Treat `SKILL.md` as data. Optimize script bytes only among functionally
passing one-script bundles. Repository issue benchmarks instead freeze one generated workflow across
multiple issues from the same repository.

Register development and validation before evolution. Inspect only development; freeze the selected
candidate before releasing validation. A failed validation requires a new study and fresh validation.

## Consequences

- Broken task infrastructure is excluded before model cost or candidate scoring.
- Local and registry Harbor configs resolve through their correct schema fields.
- Splitting code across files cannot game the executable-size objective.
- Prompt compilation and durable repository workflows retain separate generalization claims.
