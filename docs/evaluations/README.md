# Evaluation References

Published studies contain aggregate results and cryptographic evidence commitments only. Native jobs,
tasks, prompts, verifiers, reports, trajectories, patches, locks, and ledgers remain private.

- [Codex-only reference, 2026-09-03](studies/codex-only-reference-20260903/publication/index.md)
- [G010 deterministic contract study, 2026-09-04](studies/zx-workflow-author-g010-evolution-v1-20260904/publication/index.md)
- [G010 validation recovery v2, 2026-09-04](studies/zx-workflow-author-g010-validation-recovery-v2-20260904/publication/index.md)
- [G010 adapter 1.1 evolution v3, 2026-09-04](studies/zx-workflow-author-g010-adapter11-evolution-v3-20260904/publication/index.md)
- [G010 holdout admission v4, 2026-09-04](studies/zx-workflow-author-g010-holdout-admission-v4-20260904/publication/index.md)

All published rows are descriptive. Causal deltas require a contemporary paired control with
identical locks except for the injected skill. See
[ADR 0036](../../.specs/adr/0036-publish-codex-only-reference-baselines.md).

Codex-only rows measure direct problem solving. G010 rows measure deterministic skill-contract
conformance and cannot be used to compute cross-study deltas. The original G010 v1 validation is
retained as unavailable because a pre-treatment fixture defect prevented either skill from running.

Recovery v2 produced valid paired validation results (2/2 for both arms) but no promotion decision:
development used adapter 1.0.0 while validation used the fail-closed adapter 1.1.0. The strict Pareto
profile gate rejected that drift; holdout remained sealed and the baseline was retained.

V3 stopped before candidate execution: fresh validation passed Oracle admission 2/2, but the
inherited holdout failed 0/2 without errors. Neither sealed split was released and no candidate was
promoted or retried.

V4 also stopped before candidate execution. Its fresh holdout failed the one-shot Oracle admission
0/2 without errors and was frozen without repair or retry. Because the cohort was not registered in
the organizer before execution, V4 is additionally ineligible for selection or promotion.
