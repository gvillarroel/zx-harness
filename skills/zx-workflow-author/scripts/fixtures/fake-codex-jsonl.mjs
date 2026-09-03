#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

// Consume the complete prompt to prove the runtime closes stdin for the non-interactive process.
let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  prompt += chunk;
}

// Mirror Codex's argv and last-message contract without network access or model inference.
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  throw new Error("Missing --output-last-message path.");
}
const isolatedHome = process.env.HOME ?? "";
const isolatedCodexHome = process.env.CODEX_HOME ?? "";
const mode = process.env.ZX_FAKE_CODEX_MODE ?? "success";
const candidate = JSON.stringify({
  ok: true,
  isolatedHome: basename(isolatedHome) === "home",
  isolatedCodexHome:
    basename(isolatedCodexHome) === "codex-home" && isolatedCodexHome !== isolatedHome,
  isolatedSqliteHome: basename(process.env.CODEX_SQLITE_HOME ?? "") === "sqlite-home",
  authPresent: existsSync(`${isolatedCodexHome}/auth.json`),
  configAbsent: !existsSync(`${isolatedCodexHome}/config.toml`),
  ignoreUserConfig: process.argv.includes("--ignore-user-config"),
  promptReceived: prompt.includes("Runtime problem:"),
});
writeFileSync(
  process.argv[outputIndex + 1],
  mode === "oversized-message" ? "x".repeat(1_000_001) : candidate,
);
if (process.env.ZX_FAKE_HOME_REPORT) {
  // Expose paths only to the test-owned target so cleanup can be checked after the child exits.
  writeFileSync(
    process.env.ZX_FAKE_HOME_REPORT,
    JSON.stringify({ isolatedHome, isolatedCodexHome, isolatedSqliteHome: process.env.CODEX_SQLITE_HOME }),
  );
}

// Put a credential-shaped sentinel in content fields to prove telemetry never persists raw events.
const secretSentinel = "api_key=ZX_RAW_JSONL_SECRET_SENTINEL";
console.log(JSON.stringify({ type: "thread.started", thread_id: "fixture-thread" }));
console.log(JSON.stringify({ type: "turn.started" }));
console.log(JSON.stringify({
  type: "item.completed",
  item: {
    id: "fixture-command",
    type: "command_execution",
    command: "fixture-command",
    aggregated_output: secretSentinel,
    exit_code: 0,
    status: "completed",
  },
}));
console.log(JSON.stringify({
  type: "item.completed",
  item: { id: "fixture-message", type: "agent_message", text: candidate },
}));
if (mode === "malformed") {
  console.log(`not-json ${secretSentinel}`);
}
const completed = {
  type: "turn.completed",
  usage: {
    input_tokens: 100,
    cached_input_tokens: mode === "invalid-usage" ? 140 : 40,
    cache_write_input_tokens: 5,
    output_tokens: 20,
    reasoning_output_tokens: 10,
  },
};
if (mode !== "missing-usage") {
  console.log(JSON.stringify(completed));
}
if (mode === "duplicate-turn") {
  console.log(JSON.stringify(completed));
}
if (mode === "nonzero") {
  process.exitCode = 7;
}
