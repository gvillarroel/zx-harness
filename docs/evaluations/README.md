# Evaluation References

Published studies contain aggregate results and cryptographic evidence commitments only. Native jobs,
tasks, prompts, verifiers, reports, trajectories, patches, locks, and ledgers remain private.

- [Codex-only reference, 2026-09-03](studies/codex-only-reference-20260903/publication/index.md)
- [G010 deterministic contract study, 2026-09-04](studies/zx-workflow-author-g010-evolution-v1-20260904/publication/index.md)
- [G010 validation recovery v2, 2026-09-04](studies/zx-workflow-author-g010-validation-recovery-v2-20260904/publication/index.md)
- [G010 adapter 1.1 evolution v3, 2026-09-04](studies/zx-workflow-author-g010-adapter11-evolution-v3-20260904/publication/index.md)
- [G010 holdout admission v4, 2026-09-04](studies/zx-workflow-author-g010-holdout-admission-v4-20260904/publication/index.md)
- [G010 adapter 1.1 evolution v5, 2026-09-04](studies/zx-workflow-author-g010-adapter11-evolution-v5-20260904/publication/index.md)
- [G010 adapter 1.1 evolution v6, 2026-09-04](studies/zx-workflow-author-g010-adapter11-evolution-v6-20260904/publication/index.md)
- [G010 adapter 1.1 evolution v7, 2026-09-04](studies/zx-workflow-author-g010-adapter11-evolution-v7-20260904/publication/index.md)
- [G011 adapter 1.1 evolution v8, 2026-09-04](studies/zx-workflow-author-g011-adapter11-evolution-v8-20260904/publication/index.md)
- [G011 adapter 1.1 evolution v9, 2026-09-04](studies/zx-workflow-author-g011-adapter11-evolution-v9-20260904/publication/index.md)
- [G011 producer-qualified evolution v10, 2026-09-04](studies/zx-workflow-author-g011-adapter11-evolution-v10-20260904/publication/index.md)
- [G012 unique deterministic context retrieval, 2026-09-04](studies/zx-workflow-author-g012-retrieval-20260904/publication/index.md)
- [Luna alone versus G012, real paired observations, 2026-09-04](studies/luna-g012-real-paired-20260904/publication/index.md)

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
0/2 without errors and was frozen without repair or retry. Its terminal receipt binds no
pre-execution organizer registration evidence, making V4 ineligible for selection or promotion.

V5 stopped before semantic execution. The organizer rejected a validation-bound admission stage
before validation release, revealing a circular dependency with development selection. No Oracle or
candidate job ran; the unchanged blind holdout remains eligible for a fresh preregistered study.

V6 also stopped before semantic execution. Independent review rejected a pre-release holdout Oracle
job modeled as development evidence. No Oracle or candidate job ran. Holdout IDs and high-level file
names were observed after candidate sealing; V7 must defer Oracle admission until holdout release and
must not permit mutation or reselection.

V7 completed native paired development and validation. G010 reproduced a 9/10 to 10/10 development
gain without regression, then tied G009 at 0/2 on fresh validation. Pareto retained the baseline. The
validation verifier exposed only scalar reward, so the frozen strict gate also stopped as
non-evaluable. No retry, mutation, holdout release, Oracle run, or promotion occurred. Future studies
must freeze metric-schema compatibility before release; see
[ADR 0038](../../.specs/adr/0038-freeze-metric-schema-before-split-release.md).

V8 improved paired development reward from 10/12 for G010 to 12/12 for G011 with no execution errors,
and the Pareto archive retained only G011 without using holdout data. The frozen development
allowlist omitted nine legitimate protected metrics emitted by seven historical cases, so the strict
gate rejected before validation release. Neither fresh six-case cohort was released or run; G010
remained installed. V9 must freeze exact case-level reward schemas before execution; see
[ADR 0039](../../.specs/adr/0039-freeze-case-level-reward-schemas.md).

V9 accepted that corrected development readjudication, then released fresh validation for a one-shot
Oracle admission. The Oracle completed 6/6 without errors or retries but passed only 4/6; both failed
trials were final semantic verifier outcomes. Candidate arms did not run, holdout stayed sealed, and
G010 remained installed. Future cohorts require producer-side Oracle attestation before registration;
see [ADR 0040](../../.specs/adr/0040-require-producer-oracle-attestation.md).

V10 reused the immutable 12-case development pairing, where G011 passed 12/12 versus G010 at 10/12,
then used independently producer-qualified fresh validation and holdout cohorts. Both live Oracles and
all four candidate arms passed 6/6 with exact `reward` and `workflow_contract` scores of 1, zero
errors, and zero retries. Strict paired gates found no regression and promoted the complete sealed
G011 bundle; see [ADR 0041](../../.specs/adr/0041-bind-closed-evaluated-bundles.md). Development remains
adaptive evidence, producer separation is procedural, and no causal comparison to Codex-only rows is
supported.

G012 reran a contemporary 15-case development pair: G011 passed 12/15 and G012 passed 15/15,
preserving all 12 historical cases. Fresh producer-qualified validation passed its live Oracle 4/4,
then G011 passed 1/4 and G012 passed 4/4. Both strict gates found zero protected-metric regressions,
execution errors, or semantic retries. The complete sealed G012 bundle was promoted after Windows
and Linux suites and both public runtime input modes passed; see
[ADR 0042](../../.specs/adr/0042-count-unique-context-paths-before-ranking.md). Four local Linux
test-environment failures remain recorded. No additional holdout or model calls were declared.
Custody is procedural; incidental image metadata exposure after candidate sealing is documented.
These targeted deterministic results do not estimate end-to-end Codex efficacy or model cost.

The contemporary Luna comparison used one existing real development problem per dataset and arm.
Terminal-Bench passed 9/16 checks without the skill versus 0/16 after a treatment timeout; DeepSWE
passed 80/82 new and 643/643 existing checks without the skill versus 0/82 and 643/643 with G012.
Neither arm fully solved either task. Treatment authentication, timeout, protocol, and accounting
failures remain recorded. These operational observations do not establish causal quality or efficiency
deltas, replace the prior Sol references, or authorize promotion.
