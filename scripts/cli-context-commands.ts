import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { CliOpts, makePath, resolvePackageRoot } from "./cli-utils.js";
import { spawnSync } from "child_process";

const pkgRoot = resolvePackageRoot({ fromUrl: import.meta.url });

function contextBinCandidate() {
  if (process.env.DEUK_AGENT_CONTEXT_BIN) {
    return resolve(process.env.DEUK_AGENT_CONTEXT_BIN);
  }
  return resolve(pkgRoot, "..", "DeukAgentContext", "bin", "deuk-agent-context.js");
}

export function runContextCommand(args = []) {
  const localBin = contextBinCandidate();
  const result = existsSync(localBin)
    ? spawnSync(process.execPath, [localBin, ...args], { stdio: "inherit", cwd: process.cwd() })
    : spawnSync("deuk-agent-context", args, {
        stdio: "inherit",
        cwd: process.cwd(),
        shell: process.platform === "win32",
      });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("deuk-agent-context command not found. Install or link DeukAgentContext, or set DEUK_AGENT_CONTEXT_BIN.");
    }
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}
