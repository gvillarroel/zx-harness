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
