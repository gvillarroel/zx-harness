# ADR 0040: Require producer Oracle attestation

- Status: accepted
- Date: 2026-09-04

## Decision

Before registration in an evolution study, an independent dataset producer must run the exact Oracle,
verifier, and environment contract against every validation and holdout task. Admission requires all
declared rewards at their pass thresholds, exact reward schemas, complete trials, and zero errors,
exceptions, cancellations, or retries.

Bind the accepted task tree, configs, verifier inputs, Oracle report, and producer identity in a
digest-sealed custody attestation. Expose only that aggregate attestation to evolution. The study must
still perform its frozen one-shot Oracle admission after release; candidate execution remains forbidden
until that live admission passes.

A failed producer qualification is authoring evidence, not evolution evidence. Repair it before study
initialization, issue new dataset and attestation identities, and never expose its diagnostics to the
candidate optimizer.

## Consequences

- Schema-correct but semantically incomplete reference artifacts cannot consume a study's validation.
- Dataset quality control remains outside the single published product skill.
- Producer and evolution identities, evidence, and decision authority remain separate.
- V9 stays rejected; its consumed validation and diagnostics cannot tune G011 in the same study.
