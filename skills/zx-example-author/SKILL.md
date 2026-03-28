---
name: zx-example-author
description: Create minimal zx examples from short prompts. Use when asked to scaffold hello-name, hello-cop, or gh-involved-repos.
---

# zx Example Author

## Rules

- Write English only.
- Keep files minimal.
- Each example lives in its own folder.
- `index.mjs` is the entry point.
- Use the `#!/usr/bin/env zx` shebang.
- Set `$.quote = quote;`.
- Keep failures explicit and actionable.
- Verify required CLIs before real work when the example depends on them.
- Match the requested file paths exactly.
- Prefer writing the exact recipe content with one edit.
- When a recipe matches, copy it exactly except for the requested output path.
- On Windows, do not use bash heredocs like `cat <<EOF`.

## Workflow

1. Detect the target example from the prompt path.
2. Create the parent folder if needed.
3. Write only the required files.
4. Use the exact recipe body when a recipe matches.
5. Return the exact completion note for the matched recipe.

## Prompt Mapping

- `deliverables/hello-name/index.mjs` -> `hello-name`
- `deliverables/hello-cop/index.mjs` -> `hello-cop`
- `deliverables/gh-involved-repos/index.mjs` -> `gh-involved-repos`
- `deliverables/gh-involved-repos/repo.ts` -> `gh-involved-repos`

## Completion Notes

- `hello-name`: `Created \`deliverables/hello-name/index.mjs\` with the requested zx hello-name script.`
- `hello-cop`: `Created \`deliverables/hello-cop/index.mjs\` with the prescribed Copilot CLI zx script; runs \`copilot -p 'ping' --model gpt-5-mini\` via \`bash.exe\`.`
- `gh-involved-repos`: `Created \`deliverables/gh-involved-repos/index.mjs\` and \`deliverables/gh-involved-repos/repo.ts\` with the requested gh-involved-repos example.`

## Example Recipes

### `hello-name`

Write `index.mjs` only.

- Copy the script exactly.
- Set `$.shell = "bash.exe";`.
- Accept the name from `process.argv.slice(3)` first.
- Fall back to `await question("Name: ")`.
- Trim the name.
- Throw `A non-empty name is required.` when empty.
- Print `hello <name>` with `echo`.

Use this shape:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

// zx keeps the script path in argv[2], so user args start after that entry.
const name = (
  process.argv.slice(3).find((value) => value.trim()) ??
  (await question("Name: "))
).trim();

if (!name) {
  throw new Error("A non-empty name is required.");
}

await $({ stdio: "inherit" })`echo hello ${name}`;
```

### `hello-cop`

Write `index.mjs` only.

- Copy the script exactly.
- Set `$.shell = "bash.exe";`.
- Run the Copilot CLI with a tiny prompt.
- Use `copilot -p 'ping' --model gpt-5-mini`.

Use this shape:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

await $`copilot -p 'ping' --model gpt-5-mini`;
```

### `gh-involved-repos`

Write `index.mjs` and `repo.ts`.

- Copy the scripts exactly.
- Keep `repo.ts` as a tiny formatter that prints `name: <owner/repo>`.
- In `index.mjs`, import `printRepo` from `./repo.ts`.
- Resolve the current user with `gh api user --jq .login`.
- Search involved issues and PRs with `gh search issues --include-prs --involves ${login} --limit 1000 --json repository`.
- Deduplicate `nameWithOwner`.
- Print one repo per line with `printRepo(repo)`.

Use this shape:

```js
#!/usr/bin/env zx

import { printRepo } from "./repo.ts";

$.quote = quote;

// Verify gh is ready, then search issues and PRs involving the current user.
const login = (await $`gh api user --jq .login`).stdout.trim();
const output =
  await $`gh search issues --include-prs --involves ${login} --limit 1000 --json repository`;
const repos = [
  ...new Set(
    JSON.parse(output.stdout).map((item) => item.repository?.nameWithOwner).filter(Boolean),
  ),
];

for (const repo of repos) {
  printRepo(repo);
}
```

```ts
// Keep output flat and easy to pipe.
export function printRepo(name: string) {
  console.log(`name: ${name}`);
}
```
