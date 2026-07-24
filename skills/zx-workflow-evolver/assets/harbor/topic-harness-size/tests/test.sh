#!/bin/sh
set -u

# Remove agent-controlled files so only fresh verifier evidence can affect Harbor rewards.
mkdir -p /logs/verifier
rm -f /logs/verifier/reward.json /logs/verifier/diagnostics.json

# Run the dependency-free verifier and preserve its diagnostics even for a valid failing candidate.
node /tests/verify.mjs /app/generated /logs/verifier

# Fail closed only when the verifier itself could not publish numeric evidence.
if [ ! -f /logs/verifier/reward.json ]; then
  printf '%s\n' '{"reward":0,"script_size_bytes":0,"script_size_negative":0,"functional":0,"size_gate":0,"terminal_tools":0,"incremental":0,"okf":0,"sources":0,"prompt_diversity":0,"safe_arguments":0}' \
    > /logs/verifier/reward.json
fi

exit 0
