#!/usr/bin/env node
/**
 * Global Proxy for DeukAgentFlow CLI
 * Runs the bundled CLI by default. Maintainers can opt into local workspace
 * source routing with DEUK_AGENT_FLOW_USE_LOCAL=1 or DEUK_AGENT_FLOW_KIND=source.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(currentDir) {
  let dir = currentDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "DeukAgentFlow", "scripts", "out", "scripts", "cli.js"))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, ".git")) && fs.existsSync(path.join(dir, "DeukAgentFlow"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const shouldUseLocalSource = process.env.DEUK_AGENT_FLOW_USE_LOCAL === "1"
  || process.env.DEUK_AGENT_FLOW_USE_LOCAL === "true"
  || process.env.DEUK_AGENT_FLOW_KIND === "source";

const wsRoot = shouldUseLocalSource ? findWorkspaceRoot(process.cwd()) : null;
if (wsRoot) {
  const localCli = path.join(wsRoot, "DeukAgentFlow", "scripts", "out", "scripts", "cli.js");
  const bundledCli = path.resolve(path.join(__dirname, "..", "scripts", "out", "scripts", "cli.js"));
  if (fs.existsSync(localCli) && localCli !== bundledCli) {
    const args = process.argv.slice(2);
    const result = spawnSync("node", [localCli, ...args], { stdio: "inherit" });
    process.exit(result.status !== null ? result.status : 1);
  }
}

// 기본 경로는 같은 프로세스에서 실행한다. 여기서 node를 한 번 더 띄우면 부팅 비용만
// 순손실이며(1064 실측 60ms), 매 턴 나가는 표면이라 그 손실이 매 턴 과금됐다.
const myCli = path.join(__dirname, "..", "scripts", "out", "scripts", "cli.js");
// cli.js는 main()을 스스로 실행하고 끝나면 process.exit를 호출한다. 여기서 exit를
// 겹쳐 부르면 그 비동기 본문이 끝나기 전에 잘려 출력이 통째로 사라진다.
if (fs.existsSync(myCli)) {
  await import(pathToFileURL(myCli).href);
} else {
  console.error("Error: Could not find DeukAgentFlow CLI script at " + myCli);
  process.exit(1);
}
