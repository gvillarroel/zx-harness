# Skill Libraries

A library is an explicit directory containing `SKILL.md` files. Do not assume a global path.

```bash
node <skill-directory>/scripts/inspect-skill-library.mjs <skill-library>
```

The command exposes names, descriptions, relative entrypoints, and missing Markdown references. Route
from descriptions; read each selected skill completely before assigning it.

- Attach zero to three skills only to one producer or reviewer context whose task matches them.
- Do not attach skills to command or TF-IDF stages.
- Give producers and reviewers independent selections. Do not leak all available guidance everywhere.
- Skip skills requiring unavailable tools, missing inputs, interaction, or broader authority.
- Prefer narrow implementation guidance for producers and acceptance, security, or domain review
  guidance for reviewers.

Scaffolding follows selected Markdown references without executing library scripts. It caps each
compiled skill at 48,000 bytes and each context at 64,000 bytes, embeds only selected guidance, and
binds it by SHA-256. Generated workflows never depend on the source library.

Skill guidance is lower authority than the runtime problem, repository rules, stage prompt, mutation
scope, agent route, gate, retry cap, permissions, and secret boundary.
