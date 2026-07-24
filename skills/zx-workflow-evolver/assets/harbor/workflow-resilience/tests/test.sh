#!/bin/bash
set -u

# Remove agent-controlled reward artifacts before the verifier computes fresh evidence.
mkdir -p /logs/verifier
rm -f /logs/verifier/reward.json /logs/verifier/reward.txt /logs/verifier/diagnostics.json

# Run the dependency-free verifier; it records metric-level diagnostics even when a case fails.
node /tests/verify.mjs --candidate /app/workflow.mjs --logs /logs/verifier

# Fail closed if the verifier crashes before producing its own numeric reward.
if [ ! -f /logs/verifier/reward.json ]; then
  printf '%s\n' '{"reward":0,"functional":0,"resilience":0,"efficiency":0,"security":0,"determinism":0}' \
    > /logs/verifier/reward.json
fi

# Let Harbor distinguish a valid zero reward from a verifier execution exception.
exit 0
