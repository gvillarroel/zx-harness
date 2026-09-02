#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const expected = new Map([
  ["command-runtime.mjs", "73df5351e481775cd6703ba43d5a386776e069b5bc0921b0da0defff31984b70"],
  ["scaffold-topic-knowledge.mjs", "81416e027fb218bd26cb82dd4d625defa2b430d7b16f9abea2e37cbd3751b0be"],
  ["topic-runtime.mjs", "efb814db3e2f455974dc719b8fdbc7c844de8d76f3b451ca4b95068825774932"],
]);

try {
  // Seal every reviewed runtime dependency before the helper writes task-visible output.
  for (const [name, digest] of expected) {
    const actual = createHash("sha256").update(readFileSync(path.join(here, name))).digest("hex");
    if (actual !== digest) throw new Error(`runtime digest mismatch: ${name}`);
  }

  // Delegate only the generic scaffold operation; topics remain exact runtime argv data later.
  const scaffold = path.join(here, "scaffold-topic-knowledge.mjs");
  const result = spawnSync(process.execPath, [scaffold, "/app/generated"], {
    cwd: "/app",
    stdio: "inherit",
    timeout: 60000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw result.error || new Error(`scaffold failed: ${result.signal || result.status}`);
  }
  process.stdout.write("compact topic workflow installed\n");
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
