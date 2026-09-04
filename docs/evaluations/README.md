# Evaluation References

Published studies contain aggregate results and cryptographic evidence commitments only. Native jobs,
tasks, prompts, verifiers, reports, trajectories, patches, locks, and ledgers remain private.

- [Codex-only reference, 2026-09-03](studies/codex-only-reference-20260903/publication/index.md)
- [G010 deterministic contract study, 2026-09-04](studies/zx-workflow-author-g010-evolution-v1-20260904/publication/index.md)
- [G010 validation recovery v2, 2026-09-04](studies/zx-workflow-author-g010-validation-recovery-v2-20260904/publication/index.md)

All published rows are descriptive. Causal deltas require a contemporary paired control with
identical locks except for the injected skill. See
[ADR 0036](../../.specs/adr/0036-publish-codex-only-reference-baselines.md).

Codex-only rows measure direct problem solving. G010 rows measure deterministic skill-contract
conformance and cannot be used to compute cross-study deltas. Its released validation is retained
as unavailable because a pre-treatment fixture defect prevented either skill from running.

Recovery v2 produced valid paired validation results (2/2 for both arms) but no promotion decision:
development used adapter 1.0.0 while validation used the fail-closed adapter 1.1.0. The strict Pareto
profile gate rejected that drift; holdout remained sealed and the baseline was retained.
