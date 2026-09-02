---
adr: "0027"
title: "ADR 0027: Delegate Stable Security Audits"
summary: "Generate one compact wrapper around a reviewed digest-bound audit runtime."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Skills"
tags:
  - zx
  - harbor
  - security
  - scripts
---

# ADR 0027: Delegate Stable Security Audits

## Context

Development trials repeatedly regenerated the same Trivy and CSV machinery but varied in invalid
JSON, TypeScript, imports, output handling, argv construction, and nonexistent zx APIs. One full
self-contained generation passed, but later samples exposed new mechanical failures.

## Decision

Move the reviewed deterministic audit into one `security-audit-runtime` helper. Generate exactly one
small zx wrapper that invokes the helper through the digest-bound skill root with three task paths.
Keep the helper provider-independent, offline, and free of task answers or verifier access.

## Consequences

- Generated bundles retain one executable while avoiding repeated scanner implementations.
- Harbor locks both the wrapper contract and helper bytes in the candidate skill digest.
- New audit shapes require a new runtime or a self-contained script, not hidden runtime branching.

## Verification

`scout-security-runtime-final-20260902a` generated one 363-byte wrapper using 156 output tokens. The
script exited `0` and passed all seven official tests with reward `1`; no second inference or Harbor
retry occurred.
