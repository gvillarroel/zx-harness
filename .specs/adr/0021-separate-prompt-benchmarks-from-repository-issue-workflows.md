---
adr: "0021"
title: "ADR 0021: Separate Prompt Benchmarks From Repository Issue Workflows"
summary: "Keep the one-shot prompt compiler as an experiment and make runtime pi reasoning the permanent issue-solving architecture."
status: "Accepted"
date: "2026-08-25"
product: "zx-harness"
owner: "Platform Architecture"
area: "Repository Automation"
tags:
  - zx
  - pi
  - issues
  - skills
  - harbor
---

# ADR 0021: Separate Prompt Benchmarks From Repository Issue Workflows

## Context

ADRs 0012-0017, 0019, and 0020 optimize an intentionally isolated Terminal-Bench experiment. Its
generator sees only one prompt, emits a disposable script, and forbids runtime model calls. A routed
helper can therefore make the benchmark score well while failing the product objective: one durable
repository-aware workflow that reasons about and solves future issues.

## Decision

Keep `zx-prompt-solver` as a benchmark-only experiment. It is evidence about prompt-to-program
compilation, not evidence that a permanent issue workflow generalizes.

Add `zx-repository-issue-workflow`. Its author inspects stable repository evidence and generates one
standalone profile, repository guide skill, curated advisory skills, and zx runtime. The generated
bundle contains no issue answer or task-derived executable implementation.

For each new issue, the frozen runtime:

1. classifies the issue against repository-specific sectors
2. ranks bounded repository context and relevant successful-run memory
3. selects up to three digest-bound skills and exposes them through pi's native `--skill` interface
4. pre-routes the whole issue to GPT-5.6 Luna or a declared GPT-5.6 Sol power sector
5. runs the pi coding agent in an isolated Git worktree
6. retries the same route with bounded gate diagnostics
7. applies only a gate-passing patch and records append-only private evidence

Sol is not a post-result fallback. Repository instructions remain available to pi. Ambient skills,
extensions, prompt templates, and themes are disabled so only generated selections enter the run.

Evaluate the generated workflow, not one solved issue. Freeze it across same-repository development
issues, select only from development evidence, digest-bind it, then release one pre-registered sealed
validation cohort. Keep expected fixes in verifiers.

## Consequences

- Runtime intelligence performs analysis and implementation instead of replaying a prepared answer.
- Stable repository knowledge and issue-specific reasoning have separate, auditable lifecycles.
- Native pi progressive disclosure keeps specialized instructions out of unrelated issues.
- Clean Git state is required before patch promotion; failed attempts leave the original checkout
  unchanged and retain diagnostics.
- The earlier 1.0 prompt-solver scores do not measure this architecture.
