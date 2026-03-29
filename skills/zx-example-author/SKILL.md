---
name: zx-example-author
description: Author small zx examples from short implementation requests. Use when the user wants a minimal zx script or tiny zx example, especially for interactive prompts, simple CLI wrappers, or small multi-file command examples.
---

# zx Example Author

## Rules

- Write English only.
- Keep examples small and runnable.
- Match the user-requested paths exactly.
- Create only the files needed for the requested example.
- Use `#!/usr/bin/env zx` for zx entrypoints.
- Set `$.quote = quote;` when interpolating shell arguments.
- Keep failures explicit and actionable.
- Prefer direct, readable scripts over abstractions.
- On Windows, prefer `bash.exe` when shell behavior matters.
- Avoid repo-specific assumptions, paths, or instructions.
- Do not hardcode benchmark-specific completion notes.

## Workflow

1. Infer the example intent from the request.
2. Pick the smallest script shape that satisfies that intent.
3. Write the files directly with minimal ceremony.
4. Keep the final response short and factual.

## Intent Patterns

### Interactive single-file script

Use this shape when the example needs user input or a tiny argument-driven flow.

- Prefer CLI args first, then prompt if the input is missing.
- Trim and validate user input before running commands.
- Throw a direct error when required input is empty.
- Use `echo` or another simple shell command for visible output.
- Set `$.shell = "bash.exe";` on Windows if the script shells out.
- When the request is about greeting or naming, use the domain noun in the prompt label, such as `Name:`.

Typical structure:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

const value = (
  process.argv.slice(3).find((item) => item.trim()) ??
  (await question("Value: "))
).trim();

if (!value) {
  throw new Error("A non-empty value is required.");
}

await $({ stdio: "inherit" })`echo ${value}`;
```

### Single-file CLI wrapper

Use this shape when the example is mainly a thin zx wrapper around one CLI command.

- Keep the wrapper minimal.
- Preserve the exact command family the user asked for.
- Validate the required CLI first when practical.
- Avoid side artifacts unless the user requested them.
- Set `$.shell = "bash.exe";` on Windows if the command relies on shell parsing.
- If the request is clearly a smoke test, prefer one tiny command invocation over extra flow control.

Typical structure:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

await $`tool subcommand ${"arg"}`;
```

### Multi-file data listing example

Use this shape when the example fetches data, deduplicates it, and prints flat records.

- Keep the entry script focused on orchestration.
- Put formatting or tiny helpers in a sibling module when that improves clarity.
- Fetch the current user or active identity before running user-scoped queries.
- Deduplicate stable keys before printing.
- Print one record per line in a pipe-friendly format.
- If the formatter output is named in the request, keep it literal and flat.

Typical structure:

```js
#!/usr/bin/env zx

import { printItem } from "./item.js";

$.quote = quote;

const identity = (await $`tool whoami`).stdout.trim();
const output = await $`tool list --for ${identity} --json`;
const items = [
  ...new Set(JSON.parse(output.stdout).map((item) => item.name).filter(Boolean)),
];

for (const item of items) {
  printItem(item);
}
```

```js
export function printItem(name) {
  console.log(name);
}
```

## Domain Hints

- For greeting-style examples, favor a tiny interactive script with argument fallback.
- For greeting-style examples, prefer `process.argv.slice(3)` before prompting, trim the value, fail on empty input, and print through `echo`.
- For Copilot or similar assistant CLIs, keep the example as a minimal wrapper around one prompt command, usually `tool -p <short prompt> --model <model>`.
- For GitHub involvement-style examples, resolve the viewer with `gh api user --jq .login`, query involved issues and PRs, deduplicate `nameWithOwner`, and print one repository per line.
- For GitHub formatter helpers, keep the helper tiny and focused on printing the final line shape.
