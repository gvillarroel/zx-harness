#!/bin/sh
set -eu

# Exercise the injected skill itself so baseline and candidate bundles remain the only variable.
node /harbor/skills/zx-workflow-author/scripts/scaffold-topic-knowledge.mjs /app/generated
