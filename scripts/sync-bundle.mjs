import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

/** Public npm bundle: generic template only (no monorepo paths or internal handoffs). */
const publishDir = join(pkgRoot, "publish");
const publishRulesDir = join(publishDir, "rules");
const rulesDest = join(pkgRoot, "bundle", "rules");
const agentsSrc = join(publishDir, "AGENTS.md");
const agentsDest = join(pkgRoot, "bundle", "AGENTS.md");

if (!existsSync(publishDir)) {
  throw new Error("Missing publish template dir: " + publishDir);
}
if (!existsSync(publishRulesDir)) {
  throw new Error("Missing publish/rules: " + publishRulesDir);
}
if (!existsSync(agentsSrc)) {
  throw new Error("Missing publish/AGENTS.md: " + agentsSrc);
}

if (existsSync(rulesDest)) {
  rmSync(rulesDest, { recursive: true });
}
mkdirSync(rulesDest, { recursive: true });
for (const name of readdirSync(publishRulesDir)) {
  if (!name.endsWith(".mdc")) continue;
  copyFileSync(join(publishRulesDir, name), join(rulesDest, name));
}

const agentsBody = readFileSync(agentsSrc, "utf8");
writeFileSync(agentsDest, agentsBody, "utf8");
console.log("deuk-agent-rule: synced bundle from publish/ template.");
