# ADR 0038: Freeze metric schemas before split release

- Status: accepted
- Date: 2026-09-04

## Decision

Every evaluation split declares its emitted reward keys before one-way release. Protocol preflight
must prove that the reporter-shaped output schema satisfies every downstream gate. A scalar-only
split is valid only when all frozen gates require scalar reward.

Do not infer, synthesize, or remap missing protected rewards after observing results. A released split
with an incompatible metric schema makes the study non-evaluable. Repair requires a new frozen study
and fresh validation evidence.

Post-validation failures may become development evidence for a later candidate only after the current
study terminates. The later study must use fresh validation and holdout splits.

## Consequences

- Dataset manifests bind emitted reward keys independently of task outcomes.
- Gate preflight uses a representative report-shaped fixture for each split.
- Schema compatibility is checked before validation or holdout release.
- Missing required metrics stop promotion without semantic retries.
