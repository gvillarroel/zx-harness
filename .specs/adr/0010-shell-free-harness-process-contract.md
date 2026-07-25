---
adr: "0010"
title: "ADR 0010: Use a Shell-Free Harness Process Contract"
summary: "Resolve Windows npm shims, close stdin, and preserve argv boundaries in generated workflows."
status: "Accepted"
date: "2026-07-24"
product: "zx-harness"
owner: "Platform Architecture"
area: "Knowledge Workflows"
tags:
  - harnesses
  - windows
  - process
  - security
---

# ADR 0010: Use a Shell-Free Harness Process Contract

## Context

Real arXiv trials exposed two process failures hidden by fakes: Windows selected extensionless npm
shims that `execFile` could not spawn, and Codex waited for EOF on inherited piped stdin.

## Decision

Generated topic workflows include a small shared command runtime. It passes dynamic values only as
argv, closes stdin immediately, resolves npm `.cmd` shims to their Node entrypoint on Windows, and
falls back to native executables. `TOPIC_COMMANDS_JSON` remains the adapter for other harnesses.

## Evidence

Codex and pi completed real arXiv-to-OKF publication. Codex and pi reruns returned `unchanged`;
Copilot reached its service and reported exhausted quota; OpenCode reached its configured backend
and reported a server error. Offline integration exercised all four wrappers and a fifth adapter.

## Consequences

- Generated workflows remain shell-free and standalone.
- Installed npm harnesses work on Windows without command interpolation.
- Provider authentication, quota, and service health remain external prerequisites.
