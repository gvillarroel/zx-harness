# Generate a Problem-Solving Workflow

`zx-workflow-author` creates one standalone program for a class of runtime problems. The generated
program may collect and rank evidence, call different agents in isolated contexts, inject selected
skills, validate candidates, retry with rejection evidence, and roll back failed mutations.

Use the problem-type guide for [issue triage, issue resolution, and code
review](../skills/zx-workflow-author/references/problem-types.md). Each request produces a
purpose-built workflow for that recurring type; the resulting `solve.mjs` receives the concrete
repository, issue, pull request, diff, or task at runtime.

## Author

Use [`zx-workflow-author`](../skills/zx-workflow-author/SKILL.md) against the target repository. Define
the plan described in
[`references/workflow-spec.md`](../skills/zx-workflow-author/references/workflow-spec.md), then scaffold:

```bash
node skills/zx-workflow-author/scripts/scaffold-workflow.mjs workflow.plan.json generated-workflow \
  --skill-library path/to/optional-skills
```

Omit `--skill-library` when no producer or reviewer selects skills. The target must be empty.

## Verify and run

```bash
cd generated-workflow
npm install
npm run check
npx --no-install zx solve.mjs --dry-run
npx --no-install zx solve.mjs --problem "Fix the queue race without changing public APIs"
npx --no-install zx solve.mjs --problem-file issue.md
npx --no-install zx solve.mjs --state-root /tmp/workflow-state --problem-file issue.md
```

Inspect `events.jsonl`, `model-calls.jsonl`, and the declared outputs under the state root. Structured
Codex adapters record nested token use; unmetered adapters make exact total-cost claims incomplete.
Agent authentication is ambient; credentials do not belong in the plan or run evidence.

## Validate this repository

```bash
node skills/zx-workflow-author/scripts/validate-skill.mjs
```
