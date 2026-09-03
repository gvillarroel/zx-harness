# Code-Assistant Problem Types

Generate one purpose-built workflow for the requested recurring problem type. The generated
`solve.mjs` then receives a concrete repository, issue, pull request, diff, or task at runtime. Do not
generate one universal agent loop or embed the answer to one example.

## Issue triage

Runtime problem: repository identifier plus optional query, policy, or time window.

1. Collect repository instructions, issue fields, labels, milestones, ownership, and recent related
   issues with deterministic APIs or CLIs.
2. Normalize and batch issue records before an agent sees them. Exclude secrets and unrelated source.
3. Use a code assistant to classify impact, urgency, component, duplication, missing information, and
   recommended next action against repository policy.
4. Gate the result with a JSON schema, allowed labels, complete issue coverage, stable identifiers,
   and explicit evidence. Sample or independently review high-impact and low-confidence decisions.
5. Produce a report or proposed actions by default. Require explicit authorization and another gate
   before mutating remote labels, assignments, milestones, or issue state.

Triage normally has no repository mutations and does not need a full coding-agent worktree.

## Issue resolution

Runtime problem: issue URL, number, or local issue file for the target repository.

1. Collect the issue, repository rules, manifests, architecture, related code, tests, and prior local
   evidence deterministically. Rank bounded files against the runtime problem.
2. Classify the issue before routing. Select only relevant implementation, testing, security, or
   domain skills; do not inject the whole library.
3. Run the producer code assistant in an isolated Git worktree when it may change unknown paths.
   Otherwise declare and checkpoint every mutable path.
4. Require the smallest complete change, focused regression evidence, and repository-native checks.
5. Gate formatting, types, focused tests, broader tests, mutation scope, and diff invariants before an
   independent reviewer examines the patch and executable evidence.
6. Retry the same bounded problem with exact gate or review diagnostics. Promote only the passing
   patch; leave the original checkout unchanged after terminal failure.

The generated program performs runtime diagnosis and implementation. Authoring must not encode an
expected patch, hidden test, verifier output, or issue-specific helper.

## Code review

Runtime problem: pull request URL or number, commit range, patch path, or diff-producing command input.

1. Collect repository instructions, change metadata, base/head identities, diff, affected tests, and
   relevant owning code deterministically. Preserve stable file and line locations.
2. Partition large changes by component or risk. Give each reviewer only its bounded partition plus
   the acceptance and repository rules it needs.
3. Route specialized skills only when the diff justifies them—for example concurrency, security,
   database migration, accessibility, or API compatibility.
4. Ask a code assistant for actionable correctness findings, not summaries or style preferences.
5. Gate every finding for severity, path, line, concrete failure scenario, and remediation. Reject
   claims outside the supplied diff or without evidence.
6. Use a second independent reviewer for high-risk changes or uncertain findings, then deduplicate and
   sort deterministically. Reviewing is read-only unless the user explicitly requests fixes.

## Custom problem type

Derive the same shape from the requested outcome:

- concrete runtime identifier;
- deterministic evidence acquisition;
- bounded context partitions;
- producer and reviewer responsibilities;
- context-specific skills;
- executable acceptance gates;
- declared mutation and authorization boundary;
- bounded retry and recovery behavior.

Prefer the minimum stages and agents that materially improve acceptance confidence.
