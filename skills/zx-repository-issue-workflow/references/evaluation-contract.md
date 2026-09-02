# Evaluation Contract

The candidate is the complete `zx-repository-issue-workflow` skill. Harbor injects one frozen copy.
The fixed external agent runs that candidate's scaffolder against stable task-owned repository
evidence, then executes the generated workflow on the task instruction.

DeepSWE uses the separate Pier adapter defined in
[deep-swe-evaluation.md](deep-swe-evaluation.md). Do not run its v1.1 tasks through the pinned
Harbor 0.18.0 synthetic adapter.

## Order

1. Generate disjoint private development and validation task roots.
2. Initialize an organizer study and register both roots before reading development content.
3. Plan one development evolution stage and one dependent validation stage.
4. Run one or more candidates only on development. Harbor must replace the agent's skill list with
   exactly one staged candidate and bind its digest in native locks.
5. Select and record one frozen candidate from development evidence.
6. Release validation once. Run the same digest; do not mutate, rank, or reselect afterward.
7. Start a new study with fresh validation for any subsequent change.

## Task Boundary

- Every task uses the same repository architecture and generated-workflow interface.
- Issues and expected behavior vary by case. Answers remain in the task solution and verifier.
- A task-owned fake pi is synthetic agent evidence. It proves runtime orchestration, routing, skills,
  gates, retries, and patch promotion; it is not evidence of live model capability.
- A separate local probe invokes the installed real pi and must be reported separately.
- Required rewards are `runtime_agent`, `functional`, `routing`, `skill_selection`, and `isolation`.
  All are non-compensating gates at 1.
- Provider, infrastructure, evaluator, authentication, or environment failures are non-evaluable,
  not semantic zeroes.

## External Cohorts

Use public tasks only for discovery and development. Freeze one generated workflow across several
issues from the same repository; never regenerate it per issue.

| Dataset | Public scope | Use |
| --- | ---: | --- |
| [Multi-SWE-bench](https://github.com/multi-swe-bench/multi-swe-bench) | 1,632 multilingual tasks | First multilingual development cohort; group by repository. |
| [SWE-bench Pro](https://hub.harborframework.com/datasets/scale-ai/swe-bench-pro/latest) | 731 tasks | Later development; exclude adapter-listed invalid patches and timeouts. |
| [Senior SWE-Bench](https://hub.harborframework.com/datasets/snorkel-ai/senior-swe-bench-v2026.06/latest) | 50 tasks | Fresh complex development cases. |
| [SWE-rebench](https://hub.harborframework.com/datasets/swe-rebench/swe-rebench-leaderboard/latest) | 860 tasks | Pre-register an unseen monthly release for sealed validation or holdout. |

Oracle-preflight the exact task and image before model evaluation. Pin package version, task
checksum, repository revision, and image digest. Registry, provider, and environment failures are
not product failures.

DeepSWE is the first supported external lane. Group it by repository, preserve its separate
verifier and commit-collect hook, use Pier 0.3.1, and keep all task and job bytes external. Multiple
development issues from one repository test workflow reuse; sealed validation uses unseen
repositories and only the development-selected candidate digest.
