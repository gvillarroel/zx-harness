#!/usr/bin/env zx

import { execFileSync } from "node:child_process";

try {
  execFileSync("copilot", ["--version"], { stdio: "ignore" });
} catch {
  throw new Error("Required CLI not found: copilot");
}

execFileSync("copilot", ["-p", "ping", "--model", "auto"], { stdio: "inherit" });
