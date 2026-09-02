---
adr: "0014"
title: "ADR 0014: Resolve zx from the Generated Bundle Root"
summary: "Install pinned zx in the generated bundle ancestor and execute that exact binary."
status: "Accepted"
date: "2026-08-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "Runtime"
tags:
  - zx
  - esm
  - harbor
  - isolation
---

# ADR 0014: Resolve zx from the Generated Bundle Root

## Context

A global npm installation exposes the `zx` executable but does not make the package resolvable by an
ESM import inside `/tmp/zx-prompt-solver/<generation>/scripts/solve.mjs`. Valid generated programs that
import `zx` therefore fail before any task logic runs.

## Decision

Install the pinned `zx` package with npm's `--prefix /tmp/zx-prompt-solver`. Store every generated
bundle below that directory and execute `/tmp/zx-prompt-solver/node_modules/.bin/zx` explicitly. Do not
depend on global npm module resolution or ambient `PATH` behavior.

## Consequences

- Both `import ... from "zx"` and zx globals resolve from the same pinned package tree.
- The executed runtime path is fixed and auditable.
- Runtime installation remains isolated from `/app` submission artifacts.
