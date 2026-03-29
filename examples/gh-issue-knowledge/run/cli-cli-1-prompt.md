Read `C:/Users/villa/dev/zx-harness/examples/gh-issue-knowledge/run/cli-cli-1-context.json`.

Investigate GitHub issue `cli/cli#1`.

Goal:
- Produce the final answer only as markdown for `C:/Users/villa/dev/zx-harness/examples/gh-issue-knowledge/cli-cli-1-task-knowledge.md`.
- Investigate until the issue is sufficiently understood or all useful sources are exhausted.
- Stop when more searching is unlikely to change implementation or triage decisions.

Process:
- Start from the saved context file.
- Inspect the target repository when a local checkout or related folders are available.
- Use web search for external docs, release notes, upstream bugs, APIs, standards, and breaking changes.
- Use optional sources only when the context file says they are enabled and reachable.
- Follow leads from one source to another when they materially reduce uncertainty.
- Do not keep searching after repeated low-value hits.

Output rules:
- Write concise English only.
- Title the document with the repo and issue number.
- Include sections: Issue, Repository Findings, External Findings, Open Questions, Suggested Next Steps, Sources.
- In Sources, include concrete files, commands, URLs, or docs actually used.
- If a source produced nothing relevant, say that briefly instead of inventing findings.
- Do not include process chatter, tool logs, or JSON.

Known local context:
- Output file: C:/Users/villa/dev/zx-harness/examples/gh-issue-knowledge/cli-cli-1-task-knowledge.md
- Local repo dir: not provided
- Extra directories: none
- Optional sources:
  - web-search: enabled; Use Codex web search for public docs, release notes, bug reports, and upstream references.
  - local-directories: disabled; Inspect user-provided folders for notes, docs, adjacent repos, or exported knowledge.
  - confluence: disabled; Optional. Set ISSUE_KNOWLEDGE_CONFLUENCE_HINT with entry instructions or search targets.
  - brave: disabled; Optional. Set ISSUE_KNOWLEDGE_BRAVE_HINT with command usage or MCP/server details.
  - extra-hints: disabled; Optional. Describe more sources, auth notes, or research constraints in ISSUE_KNOWLEDGE_EXTRA_SOURCES.
