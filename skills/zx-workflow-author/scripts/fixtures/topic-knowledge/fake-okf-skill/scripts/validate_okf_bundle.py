#!/usr/bin/env python3

"""Minimal offline OKF gate used only by the topic-workflow fixture."""

import re
import sys
from pathlib import Path


# Resolve the candidate and require its reserved index before inspecting concepts.
bundle = Path(sys.argv[1]).resolve()
index_path = bundle / "index.md"
if not index_path.is_file():
    raise SystemExit("index.md is missing")
index_text = index_path.read_text(encoding="utf-8")
if index_text.startswith("---"):
    raise SystemExit("reserved index.md must not contain frontmatter")

# Validate every non-reserved Markdown document with the same essential OKF boundary.
concepts = sorted(
    path
    for path in bundle.rglob("*.md")
    if path.relative_to(bundle).as_posix() not in {"index.md", "log.md"}
)
for concept in concepts:
    text = concept.read_text(encoding="utf-8")
    match = re.match(r"^---\r?\n(.*?)\r?\n---(?:\r?\n|$)", text, re.DOTALL)
    if not match or not re.search(r"^type:\s*\S.+$", match.group(1), re.MULTILINE):
        raise SystemExit(f"invalid OKF concept: {concept}")

# Require the generated index to cover the complete candidate exactly once.
links = re.findall(r"^\* \[[^\]]+\]\(([^)]+)\)$", index_text, re.MULTILINE)
expected = [path.relative_to(bundle).as_posix() for path in concepts]
if sorted(links) != sorted(expected):
    raise SystemExit("index links do not match concept documents")
