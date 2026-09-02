---
adr: "0028"
title: "ADR 0028: Delegate Dated Log Summaries"
summary: "Generate one compact wrapper around a reviewed dated-log summary runtime."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Skills"
tags:
  - zx
  - harbor
  - logs
  - scripts
---

# ADR 0028: Delegate Dated Log Summaries

## Context

A public development task produced correct date-range logic but exceeded the 1,800-character script
limit through repeated structures and whitespace. Raising the limit would weaken the compact-script
objective.

## Decision

Move the reusable UTC window, severity counting, and CSV ordering logic into one
`log-summary-runtime` helper. Generate exactly one small wrapper that passes the log directory,
output path, and prompt-specified reference date through the digest-bound skill root.

## Consequences

- The size limit remains unchanged.
- Generated bundles retain one executable and no task-specific counts.
- Other log schemas require an explicit runtime extension or a self-contained script.

## Verification

`scout-log-summary-runtime-pathfix-20260902a` generated one 335-byte wrapper using 159 output tokens.
The script exited `0` and passed both official tests with reward `1`; no second inference or Harbor
retry occurred.
