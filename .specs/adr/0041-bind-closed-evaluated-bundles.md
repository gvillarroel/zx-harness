# ADR 0041: Bind closed evaluated bundles end to end

- Status: accepted
- Date: 2026-09-04

## Decision

Promote the complete digest-sealed candidate tree. Never apply only a candidate's mutation paths when
the tracked product differs from its evaluated parent; that would create an unevaluated hybrid. Bind
the tracked preimage, candidate identity, installed tree, changed paths, and product validation in the
promotion receipt.

Generated workflows also use a closed bundle. Copy only `solve.mjs`, `tsconfig.json`, and
`workflow.ts` from the skill, reject source inventory drift before target creation, and embed the one
plan validator in `workflow.ts` as a data URL. Verify the completed root inventory before success.

## Consequences

- G011 installs as the exact 21-file evaluated tree, including its sealed parent lineage.
- A workflow without skills has exactly five root files; selecting skills adds only
  `workflow.skills.json`.
- Generated workflows have no implementation-only `workflow-plan.mjs` dependency.
- Scaffolding fails before target creation when source assets or final inventory drift.
