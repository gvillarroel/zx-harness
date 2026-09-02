---
adr: "0023"
title: "ADR 0023: Generate One Issue Workflow Entrypoint"
summary: "Use one zx source without package aliases for both issue planning and execution."
status: "Accepted"
date: "2026-09-01"
product: "zx-harness"
owner: "Platform Architecture"
area: "Repository Automation"
tags:
  - zx
  - issues
  - scaffolding
  - scripts
---

# ADR 0023: Generate One Issue Workflow Entrypoint

## Context

The permanent issue workflow already shares classification, context reduction, routing, and safety
logic between planning and execution. A separate dry-run command, package alias, or helper source
would duplicate an execution surface without adding capability. zx 8.8.5 also retains the source
path in `process.argv` while importing it, so the entrypoint must normalize that launcher argument.

## Decision

Generate exactly one executable source, `solve-issue.mjs`, and no package-script aliases. Invoke the
installed pinned zx with `npx --no-install`. Use `--dry-run` on the same entrypoint for planning.
Validation rejects any additional generated JavaScript, TypeScript, Python, shell, PowerShell, or
batch source. The entrypoint removes only its exact leading path when zx forwards it; no wrapper is
generated.

## Consequences

- One audited runtime owns every issue-solving path.
- Planning and live execution cannot drift between scripts.
- Stable profile, catalog, and skill Markdown remain data, not executable helpers.
