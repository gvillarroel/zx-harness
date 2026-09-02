---
adr: "0013"
title: "ADR 0013: Inject Evolvable Prompt Compiler Contracts"
summary: "Let Harbor vary only the fixed prompt compiler contract while preserving the prompt-only solver boundary."
status: "Accepted"
date: "2026-08-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - evolution
  - skills
  - isolation
---

# ADR 0013: Inject Evolvable Prompt Compiler Contracts

## Context

Harbor stages each skill candidate inside the task container, but the external prompt solver originally
read its compiler contract from the host source tree. Candidate bundles therefore could not affect the
model call, making contract search decorative rather than causal.

## Decision

When Harbor supplies `skills_dir`, read only
`<skills_dir>/zx-prompt-solver/references/generator-contract.md` before task execution. Use that text as
the fixed system message and keep the exact task instruction as the only task-specific user message.
Fail closed when the candidate contract is missing, invalid, or oversized. Preserve the built-in host
contract only for direct runs without injected skills.

During evaluation-guided search, mutate candidate copies of the contract only. Keep external agent
code, model profile, one-call policy, generated bundle schema, runtime, task cohort, and verifier fixed.
Record the contract source and digest in private trial evidence.

## Consequences

- Harbor rewards are causally attributable to the injected contract under a fixed execution profile.
- Candidate contracts cannot inspect task state before generation.
- A missing or malformed staged candidate fails instead of silently falling back to the baseline.
- Direct Terminal-Bench runs remain compatible with the checked-in contract.
