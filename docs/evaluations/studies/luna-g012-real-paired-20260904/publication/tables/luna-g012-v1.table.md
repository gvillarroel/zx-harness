# Luna alone versus G012: real paired observations

Measured 2026-09-04. G012 did not demonstrate an end-to-end benefit in these runs. Luna alone produced stronger partial artifacts; treatment operational failures and incomplete accounting prevent a clean quality or efficiency comparison.

## Protocol

Codex 0.153.0, gpt-5.6-luna, high effort on both arms and all requested child models. One existing development task per dataset, one native attempt per arm, 1,800-second agent cap, no supervisor retries. Opposite arm order across two concurrent dataset lanes. G012 remained frozen at commit `e9a880b0fecc7fbbce532d79b3327e2fde56c9b9`.

These are two individual problems, not full Terminal-Bench or DeepSWE benchmark scores. All failures are retained. This is not an evolution, validation, holdout, or promotion study.

## Terminal-Bench

| Metric | Codex + Luna alone | Codex + Luna + G012 |
| --- | ---: | ---: |
| Fully solved tasks | 0/1 | 0/1 (timeout) |
| Official checks passed | 9/16 (56.25%) | 0/16 (0.00%) after timeout |
| Agent time, including orchestration | 17m 20s | 30m 01s |
| Recorded tokens, input + output | 4,778,891 | >= 7,147,360; total unavailable |
| Outer input / output tokens | 4,734,982 / 43,909 | 7,110,000 / 37,360 |
| Outer requests with recorded metrics | 67 | 83 |
| Nested model processes attempted | 0 | 2 |
| Workflow runs / passed | 0 / 0 | 2 / 0 |
| Native execution errors | 0 | 1 |
| Total API-price equivalent | $0.1901 | n/a; outer recorded $0.2215 |
| Complete token accounting | Yes, observed trace | No |

## DeepSWE

| Metric | Codex + Luna alone | Codex + Luna + G012 |
| --- | ---: | ---: |
| Fully solved tasks | 0/1 | 0/1 |
| Official checks passed | 723/725 (99.72%) | 643/725 (88.69%) |
| New requirements (F2P) | 80/82 (97.56%) | 0/82 (0.00%) |
| Existing checks preserved (P2P) | 643/643 (100.00%) | 643/643 (100.00%) |
| Agent time, including orchestration | 18m 45s | 21m 15s |
| Recorded tokens, input + output | 6,815,407 | >= 4,575,540; total unavailable |
| Outer input / output tokens | 6,771,458 / 43,949 | 4,557,578 / 17,962 |
| Outer requests with recorded metrics | 80 | 64 |
| Nested model processes attempted | 0 | 1 |
| Workflow runs / passed | 0 / 0 | 1 / 0 |
| Native execution errors | 0 | 0 |
| Total API-price equivalent | $0.2202 | n/a; outer recorded $0.1619 |
| Complete token accounting | Yes, observed trace | No |

## Interpretation and boundaries

- Terminal treatment exceeded the outer time limit. Its first nested call lacked authentication; the agent supplied an explicit auth-file path and launched a prohibited second workflow. That authenticated child ran tools but timed out without final usage. Both runs rolled back the output. The unfinished artifact passed 0/16 checks. A runtime snapshot was not exported before interruption.
- DeepSWE treatment made one producer attempt, which lacked usable authentication and timed out without final usage. The runtime rolled back all four declared paths; no reviewer or accepted patch followed. Its 643/725 overall checks are unchanged baseline behavior, not implementation success: new requirements were 0/82. The archived standalone runtime matches a fresh G012 reconstruction in all five compared files.
- Controls invoked no named skill and no nested agent in their observed tool traces. All observed outer models and requested child models were Luna. The same preloaded dependencies, task images, prompt, wall limit, and runner adapter were frozen within each pair.
- Terminal native input-lock comparison passed, but treatment execution violated the protocol. DeepSWE native comparison rejected its custom skill-injection lock fields and arm-specific invocation path. An explicit audit found the other lock fields equal; the native rejection remains in the evidence and is not overridden.
- Input includes cached tokens; reasoning tokens are a subset of output. `>=` is a measured lower bound, not savings. Terminal also has an interrupted outer request. Costs are native agent-reported API-price equivalents, not subscription charges, and treatment outer-only costs exclude unmetered child work. No exact efficiency or Pareto ranking is supported.
- Backend state, cache warmth, host contention, and billing are not independently frozen. With one problem per dataset, neither confidence intervals nor general claims about the skill are justified. Old Sol references and deterministic G012 contract tests are not controls here.

## Durable evidence

[Machine-readable aggregate rows](luna-g012-v1.table.csv) bind each observation to its protocol, dataset, native job, report, trajectory, accounting supplement, and post-run audit digests. Native tasks, prompts, verifiers, traces, receipts, and ledgers remain private. No source skill was modified or promoted.
