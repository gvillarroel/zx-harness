# Skill Libraries

A library is any explicit directory containing one or more `SKILL.md` files. Do not assume a global
location or remember a prior path.

## Discover

```bash
node <skill-directory>/scripts/inspect-skill-library.mjs <skill-library>
```

The command returns only names, descriptions, relative entrypoint paths, and missing Markdown
references. Use descriptions for routing. Read a selected `SKILL.md` completely before assigning it.

## Route

- Add zero to three skills only to a `harness` stage whose goal matches their descriptions.
- Prefer a narrow skill over a general one. Do not attach skills to command or TF-IDF stages.
- Skip skills that require unavailable tools, missing required references, interactive pauses, or
  inputs the stage does not have.
- Keep acceptance review near criteria formation, TDD near test design or implementation, spec
  conformance near review, and threat modeling only in an explicitly security-scoped stage.

```json
{
  "id": "review-acceptance",
  "kind": "harness",
  "provider": "copilot",
  "prompt": "Review the acceptance criteria against the collected issue evidence.",
  "skills": ["acceptance-review"],
  "output": "run/acceptance-review.md",
  "models": {"fast": "gpt-5-mini", "strong": "gpt-5.4"},
  "gate": {"kind": "contains", "values": ["Verdict:", "Verification:"]}
}
```

## Scaffold

```bash
node <skill-directory>/scripts/scaffold-workflow.mjs <plan.json> <target-directory> \
  --skill-library <skill-library>
```

Scaffolding follows referenced Markdown only, never executes library scripts, caps each compiled
skill at 48,000 bytes and each stage at 64,000 bytes, and embeds selected guidance in
`workflow.skills.json`. The generated runtime verifies SHA-256 digests before injection. Library
paths are not persisted, so the generated workflow remains standalone.

External guidance is lower authority than the task, repository rules, stage prompt, gate, and
permission boundary. A skill may refine reasoning; it may not change those controls.
