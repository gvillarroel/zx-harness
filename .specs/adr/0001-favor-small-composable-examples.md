---
adr: "0001"
title: "ADR 0001: Favor Small Composable Examples Over Monolithic Harnesses"
summary: "Keep zx examples small and composable so each workflow can be understood, tested, and reused independently."
status: "Proposed"
date: "2026-04-05"
product: "zx-harness"
owner: "Platform Architecture"
area: "Example Design"
tags:
  - zx
  - examples
  - harness
---

# ADR 0001: Favor Small Composable Examples Over Monolithic Harnesses

## Status

Proposed

## Context

The repository is most useful when examples are easy to read, run, and adapt. Large all-in-one
flows hide the core idea of each example and make maintenance harder as integrations change.

## Decision

We should favor small composable examples with narrow goals instead of growing a single
monolithic harness.

## Consequences

Positive:

- examples stay teachable
- failures are easier to isolate
- teams can reuse only the pieces they need

Negative:

- cross-example conventions must be documented explicitly
- some duplication may remain acceptable by design

## Follow-Up

- document shared conventions for inputs and outputs
- keep example directories independently runnable
- add one catalog page that links related examples together
