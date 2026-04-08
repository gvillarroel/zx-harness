#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

await $`copilot -p 'ping' --model gpt-5-mini`;
