---
adr: "0019"
title: "ADR 0019: Route Prompt Solver Skills Before Generation"
summary: "Select bounded, digest-bound domain guidance from the task prompt without adding a model call."
status: "Accepted"
date: "2026-08-24"
product: "zx-prompt-solver"
owner: "Evaluation Engineering"
area: "Prompt Compilation"
tags:
  - skills
  - routing
  - provenance
  - harbor
---

# ADR 0019: Route Prompt Solver Skills Before Generation

## Context

One general compiler contract preserves prompt isolation but cannot carry deep guidance for every
terminal domain. A second routing inference would violate the one-call solver boundary.

## Decision

Bundle an explicit solver-skill catalog with each candidate. Route only from the exact task prompt and
skill descriptions, load at most three matching `SKILL.md` bodies, cap their combined bytes, and append
them below the compiler contract in the sole system message. Keep the exact task prompt as the sole user
message and task-specific evidence.

Bind each catalog entry and selected body with SHA-256. Record selected names, digests, sizes, and the
composed system digest in Harbor evidence. Treat selected guidance as advisory: it cannot change scope,
permissions, tools, retries, model routing, or verifier access.

The G017 frozen candidate passed native development and one-way independent validation at reward 1.0,
with all verifier gates at 1 and no digest drift. Publish only catalog entries whose behavior was
exercised by that gate.

## Consequences

- Specialized knowledge enters only matching generations without another inference call.
- Irrelevant prompts retain the compact base contract.
- Harbor can attribute results to exact routing and content.
- Lexical routing is deterministic but less semantic than model-driven progressive disclosure.
