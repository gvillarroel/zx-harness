---
adr: "0007"
title: "ADR 0007: Route Topic Batches Through Provider-Neutral Harness Commands"
summary: "Probe ordered command adapters so any available harness can process only the current knowledge batch."
status: "Superseded"
superseded_by: "0009"
date: "2026-07-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Knowledge Workflows"
tags:
  - harnesses
  - know
  - okf
  - incremental
---

# ADR 0007: Route Topic Batches Through Provider-Neutral Harness Commands

## Status

Superseded by ADR 0009.

## Context

ADR 0006 stages unseen knowledge versions before OKF publication. Binding that stage to one SDK
would exclude installed CLIs, alternate SDKs, and future harnesses.

## Decision

Configure ordered non-interactive command adapters. Probe each adapter and run the first available,
or an explicit `--harness` selection. Each receives the same batch manifest, prompt, isolated
candidate, and environment contract. SDKs use thin command wrappers.

Freeze prior candidate bytes. Harnesses may change only pending paths or add derived concepts.
Reject boundary violations, rebuild the index deterministically, validate OKF, then promote using
ADR 0006's transaction.

## Consequences

Positive:

- any CLI or SDK can participate without changing the workflow
- selection and evidence remain inspectable
- unchanged knowledge cannot be rewritten by a harness

Negative:

- each harness must expose a non-interactive command adapter
- availability probes and timeouts require explicit configuration
