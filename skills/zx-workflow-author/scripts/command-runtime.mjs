import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const execute = (file, args, options) =>
  new Promise((resolvePromise, rejectPromise) => {
    // Harness prompts are argv-only; close stdin so non-interactive CLIs never wait for more text.
    try {
      const child = execFile(file, args, options, (error, stdout, stderr) => {
        if (error) rejectPromise(Object.assign(error, { stdout, stderr }));
        else resolvePromise({ stdout, stderr });
      });
      child.stdin?.end();
    } catch (error) {
      rejectPromise(error);
    }
  });
const overrides = JSON.parse(process.env.TOPIC_COMMANDS_JSON ?? "{}");

export async function run(file, args, options = {}) {
  const [executable = file, ...prefix] = overrides[file] ?? [];
  const finalArgs = [...prefix, ...args];
  const settings = {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  };
  try {
    return await execute(executable, finalArgs, settings);
  } catch (error) {
    // Windows cannot execute extensionless npm shims; resolve their Node target without a shell.
    if (process.platform !== "win32" || !["EPERM", "ENOENT", "EINVAL"].includes(error.code)) {
      throw error;
    }
    const found = await execute("where.exe", [executable], settings).catch(() => null);
    const paths = found?.stdout.trim().split(/\r?\n/).filter(Boolean) ?? [];
    for (const path of paths.filter((value) => value.endsWith(".cmd"))) {
      const match = (await readFile(path, "utf8")).match(/%dp0%\\([^"]+\.[cm]?js)" %\*/i);
      if (match) {
        return await execute(process.execPath, [resolve(dirname(path), match[1]), ...finalArgs], settings);
      }
    }
    // Native executables remain the safe fallback when PATH chose a non-executable shim first.
    for (const path of paths.filter((value) => /\.exe$/i.test(value))) {
      try {
        return await execute(path, finalArgs, settings);
      } catch {}
    }
    throw error;
  }
}

export const soft = (...args) => run(...args).catch((error) => error);
