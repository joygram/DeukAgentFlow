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

/** Copy publish/ templates into bundle/ for npm packaging. */
const publishDir = join(pkgRoot, "publish");
const publishRulesDir = join(publishDir, "rules");
const rulesDest = join(pkgRoot, "bundle", "rules");
const agentsSrc = join(publishDir, "AGENTS.md");
const agentsDest = join(pkgRoot, "bundle", "AGENTS.md");
const cursorrulesSrc = join(publishDir, ".cursorrules");
const cursorrulesDest = join(pkgRoot, "bundle", ".cursorrules");

if (!existsSync(publishDir)) {
  throw new Error("Missing publish template dir: " + publishDir);
}
if (!existsSync(publishRulesDir)) {
  throw new Error("Missing publish/rules: " + publishRulesDir);
}
if (!existsSync(agentsSrc)) {
  throw new Error("Missing publish/AGENTS.md: " + agentsSrc);
}
if (!existsSync(cursorrulesSrc)) {
  throw new Error("Missing publish/.cursorrules: " + cursorrulesSrc);
}

if (existsSync(rulesDest)) {
  rmSync(rulesDest, { recursive: true });
}
mkdirSync(rulesDest, { recursive: true });
for (const name of readdirSync(publishRulesDir)) {
  if (!name.endsWith(".mdc")) continue;
  copyFileSync(join(publishRulesDir, name), join(rulesDest, name));
}

const templatesSrc = join(publishDir, "templates");
const templatesDest = join(pkgRoot, "bundle", "templates");
if (existsSync(templatesSrc)) {
  if (existsSync(templatesDest)) {
    rmSync(templatesDest, { recursive: true });
  }
  mkdirSync(templatesDest, { recursive: true });
  for (const name of readdirSync(templatesSrc)) {
    copyFileSync(join(templatesSrc, name), join(templatesDest, name));
  }
}

const agentsBody = readFileSync(agentsSrc, "utf8");
writeFileSync(agentsDest, agentsBody, "utf8");
copyFileSync(cursorrulesSrc, cursorrulesDest);
console.log("deuk-agent-rule: synced bundle from publish/ template.");
