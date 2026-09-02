---
adr: "0016"
title: "ADR 0016: Bind Custom Agent Display and Import Identities"
summary: "Declare a stable Harbor agent name beside the custom import path."
status: "Accepted"
date: "2026-08-24"
product: "zx-harness"
owner: "Platform Architecture"
area: "Evaluation"
tags:
  - harbor
  - provenance
  - agents
---

# ADR 0016: Bind Custom Agent Display and Import Identities

## Context

Harbor executes custom agents through `import_path`, while evaluation analyzers bind observed provenance to
`agent.name`. Omitting the display identity lets a valid trial finish but prevents strict result analysis.

## Decision

Declare both `name: zx-prompt-solver` and
`import_path: scripts.prompt_skill_agent:PromptSkillAgent`. Harbor 0.18.0 resolves the custom import when the
name is not built in, while native results and locks retain the stable display identity.

## Consequences

- Strict Harbor analyzers can match declared, locked, and observed agent provenance.
- The executable agent remains repository-local and explicitly imported.
- Job templates must preserve both fields.
