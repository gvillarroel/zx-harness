# ADR 0022: Human documentation under docs

## Status

Accepted

## Context

ADR 0004 keeps the product as independently copyable skills. Its broad ban on
root docs also prevented a concise README from linking to maintained human
onboarding and contributor guidance, as now requested for the repository.

## Decision

- Keep all executable product artifacts, runtime references, and generated
  workflow support inside their owning skill bundles.
- Allow docs/ for human setup, repository navigation, and maintenance guides.
- Keep README.md as the overview and docs/README.md as the human index.
- Update the repository validator to permit docs while retaining the bans on
  standalone deliverables, evaluations, examples, results, and shared runtime code.
- Preserve all scaffold, rollback, retry, and standalone-bundle validation.

## Consequences

This narrows only the documentation-location rule in ADR 0004. It does not
permit a generated workflow to depend on this repository or on docs/ at runtime.
The earlier decision remains preserved rather than rewritten.
