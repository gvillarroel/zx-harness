# Gates and Recovery

Define gates from acceptance criteria before writing agent prompts.

When executable gates or other repository files define policy, digest-bind them in non-empty
top-level `controls`. Keep those paths outside every stage `mutates` scope. The runtime verifies them
at startup and around each external process, restores changed bytes from its private startup
checkpoint, records a content-free `protected_control_changed` event, and fails the run.

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
- `command`: require exit zero; arguments may use `{candidate}`, `{root}`, or `{runDir}`.

## Retry

Return bounded, redacted stdout and stderr or reviewer feedback to the producer. Preserve the original
problem and static evidence. Do not rerun expensive collection unless a gate proves it stale. Stop
after four attempts.

## Mutation safety

List every path an agent or command may mutate. Snapshot before the first attempt, restore before each
retry, and restore after terminal failure. When mutation scope cannot be enumerated, run the stage in
an isolated Git worktree and promote only its passing patch.

Agent output is a candidate. Write accepted output atomically only after every configured gate and
reviewer passes.
