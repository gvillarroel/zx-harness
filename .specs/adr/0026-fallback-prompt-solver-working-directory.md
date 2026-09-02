---
adr: "0026"
title: "ADR 0026: Fall Back From Missing App Working Directories"
summary: "Run prompt-compiled scripts from /app when present and / otherwise."
status: "Accepted"
date: "2026-09-02"
product: "zx-harness"
owner: "Platform Architecture"
area: "Runtime"
tags:
  - harbor
  - datasets
  - runtime
---

# ADR 0026: Fall Back From Missing App Working Directories

## Context

Terminal-Bench commonly provides `/app`, but valid SkillsBench tasks may use only absolute paths.
Forcing Harbor execution into a missing `/app` prevents a validated generated script from starting
and turns runtime incompatibility into a verifier failure.

## Decision

Launch the frozen script through one fixed bootstrap rooted at `/`. Enter `/app` when it exists;
otherwise remain at `/`. Do not probe task content, expose state to the generator, or add another
solver command.

## Consequences

- Relative-path Terminal-Bench scripts retain `/app` behavior.
- Absolute-path tasks execute when `/app` is absent.
- Working-directory selection remains deterministic and independent of model output.

## Verification

`scout-security-runtime-final-20260902a` used a task image without `/app`; its generated script
exited `0`, wrote the required artifact, and passed all seven official verifier tests.
