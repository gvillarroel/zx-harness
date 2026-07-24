#!/bin/bash
set -euo pipefail

# Install the reference workflow exactly as an agent-created executable in the task workspace.
install -m 0755 /solution/workflow.mjs /app/workflow.mjs
