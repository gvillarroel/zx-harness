# ADR 0037: Release sealed evidence before native admission

- Status: accepted
- Date: 2026-09-04

## Decision

Bind every native Oracle, verifier, and candidate job to the dataset split it consumes. Run no native
validation or holdout job before that split's one-way organizer release. Static digest, schema,
container, and custody checks may run before release only when they expose no task semantics or
outcomes.

After release, Oracle admission precedes candidate execution. Candidates remain digest-sealed;
mutation, reselection, and semantic retries stay forbidden.

## Consequences

- A development-bound stage cannot carry validation or holdout native evidence.
- Protocol topology receives independent review before the first native job.
- Metadata exposure is recorded separately from content or outcome exposure.
- A topology defect terminates the study; correction starts a fresh ledger.
