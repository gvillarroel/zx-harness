---
adr: "0012"
title: "ADR 0012: Execute Prompt-Only Generated Skills"
summary: "Give a generator only the task prompt, freeze its zx skill, and make that script the sole solver."
status: "Superseded"
superseded_by: "0033"
date: "2026-08-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - terminal-bench
  - skills
  - isolation
---

# ADR 0012: Execute Prompt-Only Generated Skills

## Context

A normal terminal agent can inspect the environment, reason interactively, and repair after feedback.
That does not isolate the value of compiling a task prompt into an executable workflow.

## Decision

Add `zx-prompt-solver` as an external Harbor agent. It sends one fixed system contract and the exact
task instruction to a tool-free model call. No task files, terminal output, tests, solutions, verifier
evidence, or prior attempts enter generation.

Require structured output containing one disposable `SKILL.md` and one `#!/usr/bin/env zx` script.
Validate and digest the bundle, upload it to the task container, then execute only that fixed entrypoint.
The script's stdout and task-state mutations are the answer. Do not run post-execution inference or
repair. Keep provider credentials on the host and Harbor retries at zero.

## Consequences

- Results measure prompt-to-program compilation rather than interactive terminal reasoning.
- Generated artifacts and usage remain auditable in native Harbor evidence.
- A weak script fails without model feedback, making the boundary easy to interpret.
- Runtime coverage depends on installing pinned Node and zx tooling in each task image.
