---
name: zx-repository-issue-workflow
description: Generate a permanent repository-local zx workflow that classifies new issues, reduces context, selects native pi skills, invokes GPT-5.6 Luna or pre-routed Sol, gates changes in an isolated Git worktree, and applies only passing patches. Use for repeatable issue solving, not one-shot benchmark answers.
---

# zx Repository Issue Workflow

Generate the solver architecture; do not solve a sample issue and encode its answer.

## Workflow

1. Read repository instructions, manifests, architecture, tests, and ADRs. Do not inspect sealed
   validation or holdout tasks.
2. Read [references/repository-profile.md](references/repository-profile.md).
3. Define stable problem sectors, bounded search roots, repository conventions, protected paths,
   and executable gates. Mark only intrinsically difficult sectors for Sol.
4. If a skill library is available, inspect descriptions and select only reusable guidance relevant
   to those sectors. Never select a skill because it contains an issue answer.
5. Author `repository-profile.json`, then scaffold the permanent workflow:

   ```bash
   node <skill-directory>/scripts/scaffold-repository-issue-workflow.mjs \
     <repository-profile.json> <empty-target-directory> \
     --skill-library <optional-skill-library>
   ```

6. Run `npm install` in the generated directory. Execute
   `npx --no-install zx solve-issue.mjs --dry-run --issue-file <issue>` and inspect the sector,
   model, files, skills, gates, and caps before a live run.
7. Run `npx --no-install zx solve-issue.mjs --issue-file <issue>`. The script invokes pi at runtime;
   its agent analyzes and edits an isolated worktree. Only passing patches reach the original
   checkout.

For evaluation or evolution, read [references/evaluation-contract.md](references/evaluation-contract.md).
For DeepSWE, also read [references/deep-swe-evaluation.md](references/deep-swe-evaluation.md).
Register sealed validation before the first development run.

## Invariants

- Freeze one generated workflow across many issues in the same repository.
- Keep issue text, expected fixes, verifier details, and task-derived executables out of the bundle.
- Use Luna by default. Select Sol before inference only for a declared power sector. Retries keep the
  same model route.
- Load only the generated repository guide and up to three digest-verified skills through pi's
  native `--skill` option. Disable ambient skills and extensions.
- Require a clean Git checkout before execution. Preserve failed patches and diagnostics under the
  Git private state directory; do not mutate the checkout on failure.
- Pass commands and dynamic values as argv arrays. Never construct shell source.
- Keep gates external to pi, bound retries, cap context, redact logs, and retain append-only events.

## Acceptance

- The bundle has exactly one executable source, `solve-issue.mjs`, and no package-script aliases.
  Dry-run is an entrypoint mode, not another script.
- A dry run performs no model call, worktree creation, gate, or repository mutation.
- Tests prove runtime pi invocation, native skill selection, Luna/Sol pre-routing, same-route retry,
  gate feedback, accepted-patch application, failure isolation, context caps, and private memory.
- Synthetic Harbor development and validation use disjoint issues against one frozen workflow.
- DeepSWE development, sealed validation, and holdout keep whole repository families disjoint and
  use Pier 0.3.1 with the task source and candidate bound by digest.
