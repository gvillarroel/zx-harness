---
adr: "0029"
title: "ADR 0029: Scope Reserved Evaluation Paths"
summary: "Protect evaluator roots without rejecting same-named task subdirectories."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Security"
tags:
  - harbor
  - isolation
  - validation
---

# ADR 0029: Scope Reserved Evaluation Paths

## Context

The prompt solver must reject evaluator roots such as `/logs`, but a segment-only pattern also
rejected the legitimate task path `/app/logs` before execution.

## Decision

Protect absolute roots `/tests`, `/solution`, and `/logs`. Permit same-named descendants beneath a
different task root. Keep model, Docker, and external package boundaries unchanged.

## Consequences

- Tasks may use ordinary directories such as `/app/logs`.
- Generated scripts still cannot read Harbor's reserved root evidence.
- Positive and negative path cases remain covered by agent validation.

## Verification

`scout-log-summary-runtime-pathfix-20260902a` executed the exact `/app/logs` wrapper and passed both
official tests with reward `1`.
