---
adr: "0018"
title: "ADR 0018: Inject Stage-Scoped Skills From Explicit Libraries"
summary: "Discover skills by description, select them per intelligent stage, and embed digest-bound Markdown guidance."
status: "Accepted"
date: "2026-08-24"
product: "zx-harness"
owner: "Platform Architecture"
area: "Workflow Composition"
tags:
  - skills
  - routing
  - provenance
  - prompts
---

# ADR 0018: Inject Stage-Scoped Skills From Explicit Libraries

## Context

Workflow authors should reuse specialized guidance without remembering global skill locations or
inflating every model call with an entire catalog. External skills may also contain irrelevant,
interactive, unsafe, or oversized instructions.

## Decision

Accept an explicit `--skill-library` directory. Discover `SKILL.md` files recursively and expose only
name, description, relative path, and missing-reference warnings for routing. The author selects zero
to three skills on each harness stage; deterministic stages never receive skills.

After selection, compile only `SKILL.md` and referenced Markdown. Never execute library scripts or
copy ambient paths. Enforce per-skill and per-stage byte caps, embed only selected guidance in the
generated workflow, and bind it with SHA-256. Runtime verifies the bundle before prompt injection.

Treat embedded skill text as untrusted advisory guidance below the task, repository rules, stage
prompt, permission boundary, model route, retry policy, secret policy, and executable gate. Keep the
local `.skill-library/` repository ignored; generated workflows remain standalone.

## Consequences

- Agents route reusable expertise from current descriptions instead of remembered locations.
- Acceptance, testing, review, and security guidance can enter only their relevant model stages.
- Generated bundles preserve selection and content provenance without the source catalog.
- Referenced Markdown consumes bounded context; unsupported tools and interactive skills must be
  rejected during authoring.
