# Gates and Recovery

Define gates from acceptance criteria before writing agent prompts.

When `criteria` is present, give each criterion one unique lowercase slug ID and route every ID to
at least one deterministic gate leaf or reviewer. A leaf declares non-empty, unique `covers`; a
reviewer declares both `covers` and its own explicit `inputs` array. Unknown or uncovered IDs are a
plan error. Plans without `criteria` keep the legacy gate and reviewer contract.

A leaf may have a unique lowercase slug `id` within its stage. An explicit ID is the stable
acceptance-matrix and `gate_completed` route; otherwise the runtime uses its structural tree route.
One-character alphanumeric IDs are valid; leading or trailing hyphens are not. `all` has no ID.

When executable gates or other repository files define policy, digest-bind them in non-empty
top-level `controls`. Keep those paths outside every stage `mutates` scope. The runtime verifies them
at startup and around each external process, compares content, regular-file type, link state, and
permission mode, restores drift from a digest-sealed private checkpoint, records a content-free
`protected_control_changed` event, and fails the run.

## Order

1. parser or schema
2. compiler or type checker
3. focused unit or integration test
4. repository validation command
5. exact invariant
6. isolated reviewer agent for residual semantic risk

Supported gates:

- `contains`: require exact values in a path or current candidate.
- `json`: require valid JSON and dotted paths.
- `command`: require exit zero; arguments may use `{candidate}`, `{root}`, or the public evidence
  `{runDir}`. Deterministic commands are trusted tools; private ledger authority remains elsewhere.
- `all`: evaluate a non-empty ordered list of gates recursively. Stop at the first failing child.

`all` routes but does not cover criteria itself, so it cannot declare `covers`. Each evaluated leaf
records one content-free `gate_completed` event with its stable route, kind, covered IDs, and result.
Fail-fast leaves that were not evaluated record no completion event.

## Retry

Keep bounded repair feedback in memory. Before crossing into a later context, scrub credentials plus
the exact problem and declared-input contents. Persistent failure events contain only typed status,
byte counts, and digests—not stdout, stderr, reviewer prose, problem text, or evidence bytes. Preserve
the original problem and static evidence. Do not rerun expensive collection unless a gate proves it
stale. Stop after four attempts.

## Mutation safety

List every path an agent or command may mutate. Snapshot before the first attempt, restore before each
retry, and restore after terminal failure. When mutation scope cannot be enumerated, run the stage in
an isolated Git worktree and promote only its passing patch.

Agent output is a candidate. Publish only after every configured gate and reviewer passes. Promotion
rejects links and unsafe parents, writes under a private random same-directory path, and rechecks
parent and target identity immediately before commit. It creates an absent destination exclusively
with a hard link or atomically renames over the revalidated prior regular file. A pre-commit failure
leaves prior output untouched; cleanup removes only an inode created by this process. Portable Node
APIs do not provide conditional rename or descriptor-relative no-follow traversal on Windows, so
hostile concurrent same-UID path swaps remain outside this guarantee.

Checkpoints and append-only hash-chain heads remain under a private temporary authority root. The
run directory contains verified evidence copies and an agent-only `work/` directory; forged
public ledgers or checkpoints cannot authorize retries, restores, accounting, or success.
