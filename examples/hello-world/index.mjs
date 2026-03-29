#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

await $({ stdio: "inherit" })`echo 'hello world\n'`;
