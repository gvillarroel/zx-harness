# External Evaluation Datasets

Verified 2026-09-01. Dataset counts change; pin every package version and task checksum.

## Prompt-to-Script Track

| Dataset | Scope | Role |
| --- | ---: | --- |
| [Terminal-Bench 2](https://github.com/harbor-framework/terminal-bench-2) | 89 tasks | First public development smoke; broad file, process, and data work. |
| [SkillsBench v1.1](https://www.skillsbench.ai/) | 87 diverse tasks | Heterogeneous development; compare paired skill/no-skill conditions. |
| [Terminal-Bench Pro](https://github.com/alibaba/terminal-bench-pro) | 200 public + 200 private | Later portability and hidden-test gate; preflight its registry image. |
| [DABStep](https://github.com/harbor-framework/harbor/tree/main/adapters/dabstep) | 454 unique tasks | Data-analysis scripts; exclude overlaps and public-score leakage. |
| [BigCodeBench-Hard](https://github.com/harbor-framework/harbor/tree/main/adapters/bigcodebench_hard) | 145 Harbor tasks | Small code-generation development cases. |
| [DS-1000](https://github.com/harbor-framework/harbor/tree/main/adapters/ds1000) | 1,000 tasks | Data-science development only; exclude task 819. |
| [LiveCodeBench](https://github.com/harbor-framework/harbor/tree/main/adapters/livecodebench) | 100-task Harbor sample; 1,055 upstream v6 | Candidate sealed gate when pre-registered and uninspected. |

## Repository Track

| Dataset | Scope | Role |
| --- | ---: | --- |
| [Multi-SWE-bench](https://github.com/multi-swe-bench/multi-swe-bench) | 1,632 tasks across seven languages | First multilingual development cohort; group issues by repository. |
| [SWE-bench Pro](https://hub.harborframework.com/datasets/scale-ai/swe-bench-pro/latest) | 731 tasks | Later development; apply the adapter exclusion list. |
| [Senior SWE-Bench](https://hub.harborframework.com/datasets/snorkel-ai/senior-swe-bench-v2026.06/latest) | 50 tasks | Fresh, complex public development cases. |
| [SWE-rebench](https://hub.harborframework.com/datasets/swe-rebench/swe-rebench-leaderboard/latest) | 860 tasks | Reserve an unseen monthly release for validation or holdout. |

## Intake Gate

1. Register disjoint development and validation manifests before evolution; add holdout only when
   its final role is declared.
2. Inspect only public development content. Validation is a one-way acceptance gate; after failure,
   start a new study with fresh validation.
3. Run the exact task oracle with Harbor 0.18.0. Require reward `1`, no exception, and an accessible
   image before any model call.
4. Bind package version, task checksum, and image digest when available. Keep provider and
   infrastructure errors non-evaluable.
5. Pin an exact model endpoint. Reject provider router aliases and fail the command on trial errors.
6. Require `generated_script_count = 1` for prompt tasks. Freeze one workflow across same-repository
   issue tasks.
7. Expand from one smoke task to two or three heterogeneous development tasks before a full cohort.

## Scouting Evidence

Manual one-script smokes validate the guidance and executor boundary; they are not live generator
scores.

| Task | Result | Decision |
| --- | --- | --- |
| `terminal-bench/log-summary-date-ranges` | Oracle `1`; checksum `c833c594814ec7b8cb32eba3b9cb5ed648171efe5a074767aa64c25ea060f08f`; one-script manual verifier `1` | Keep as the first public development smoke; route `log-summary-runtime`. |
| `benchflow/software-dependency-audit` | Oracle `1`; task digest `84bebdaeedbf7777a128d48a757d36c5457aefd92b5b70b70445d1e9d81abaa4`; 1,573-byte one-script manual verifier `1` (`7/7` tests) | Keep as a security development task; route `security-audit-runtime`. |
| `benchflow/dialogue-parser` | Oracle failed because its solution could not import `dialogue_graph`. | Reject until the upstream task is repaired. |
| `terminal-bench-pro/polyglot-text-stats-script` | Alibaba registry image reset during pull. | Treat as infrastructure failure; retry only after image access is proven. |
