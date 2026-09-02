# DeepSWE Evaluation

DeepSWE is an external evaluation lane for the permanent repository issue workflow. It is not a
prompt-solver task source and does not change the workflow's product boundary.

## Frozen Inputs

Lock all of these before the first model run:

- DeepSWE Git revision as a full 40-character commit;
- Pier `0.3.1`;
- every selected task tree and task image digest;
- the complete candidate tree digest;
- explicit Luna and Sol model identifiers;
- private repository-family split membership.

Do not persist `main`, `latest`, mutable image tags, or host-relative candidate identity as a lock.
The reference revision used while adding this integration was
`0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`; re-resolve and verify it when a study is materialized.

## Study Order

1. Author a private partition manifest with
   `harbor-author-evaluation-datasets`. Keep every `metadata.repository_url` family in one split.
2. Run `prepare-deep-swe-evaluation.mjs` against a clean official checkout at the exact revision.
   Materialize the task roots and private receipt outside this repository.
3. Initialize `harbor-organize-evaluations`, register and digest-lock development and validation,
   and register holdout if used. Do this before exposing any development issue.
4. Oracle-preflight every exact task and immutable image with Pier 0.3.1.
5. Use `configure-deep-swe-search.mjs` to emit a candidate job into a new external directory. Run
   only development while evolving. The same candidate digest must be used for every issue in a
   repository.
6. Freeze one selected candidate by digest. Release validation once and run only that digest.
7. If validation fails, close the study. Any repair starts a new study with fresh validation.
8. Release holdout only after validation acceptance and only when the study declared it up front.

Development may include several issues from one repository to test reuse. Validation and holdout
must use unseen repository families, so they test transfer rather than memorization.

DeepSWE is public. A sealed split prevents this study from adapting to its withheld evidence, but it
cannot prove that a model never encountered the task before the study. Report that limitation and
do not call the result contamination-free.

## Runtime Boundary

The custom Pier agent must:

- use `/app` as the task repository;
- verify the staged candidate tree before execution;
- build the stable repository profile and workflow before receiving the task instruction;
- place the issue below `/app/.git`, outside the committed diff;
- pass all dynamic values as argv and preserve the workflow's isolated-worktree gates;
- commit a nonempty accepted patch so DeepSWE's collect hook can export it;
- leave the base commit unchanged after a failed workflow;
- avoid `/tests`, `/solution`, `/logs`, task verifier state, and task-derived executables;
- redact credential-shaped data and keep the pi auth file outside the candidate and repository.

The adapter may install its pinned runtime and contact only explicitly allowlisted package and model
domains. A task-owned solution, oracle, verifier, or hidden test can never become candidate input.

## Evidence Boundary

The preparer may parse `task.toml` metadata and structural paths. It must not print task IDs or read
instruction, solution, test, or verifier contents while validating or partitioning. The private
receipt retains exact identities and digests; the redacted summary exposes only counts and aggregate
digests.

Keep checkouts, partitions, images, credentials, jobs, locks, trajectories, patches, diagnostics,
and study ledgers outside Git. CI uses synthetic fixtures only and performs no registry, Docker,
provider, or DeepSWE download.

Pier evidence is not automatically Harbor 0.18.0 evidence. Before an existing Harbor evolver reads
it, verify the locked config, candidate digest, task digest, image digest, reward, and error
classification survive the adapter without semantic conversion. Fail closed if that proof is
missing.
