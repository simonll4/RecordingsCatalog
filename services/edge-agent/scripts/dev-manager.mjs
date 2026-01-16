#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const binExtension = process.platform === "win32" ? ".cmd" : "";
const tsNodeDevBin = join(projectRoot, "node_modules", ".bin", `ts-node-dev${binExtension}`);

const childEnv = {
  ...process.env,
  EDGE_AGENT_CHILD_COMMAND: "ts-node-dev",
  EDGE_AGENT_CHILD_ARGS: "--respawn --transpile-only --esm src/app/main.ts",
};

const managerArgs = ["--respawn", "--transpile-only", "--esm", "src/manager/main.ts"];

const proc = spawn(tsNodeDevBin, managerArgs, {
  stdio: "inherit",
  cwd: projectRoot,
  env: childEnv,
});

proc.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
