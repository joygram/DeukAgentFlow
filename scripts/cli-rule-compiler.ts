import { basename, resolve, dirname, isAbsolute } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import { DEUK_ROOT_DIR, CliOpts, makePath, parseFrontMatter } from "./cli-utils.js";
import YAML from "yaml";

/**
 * Scans directories for rule markdown files, evaluates their Frontmatter conditions,
 * and compiles a single rule string for injection.
 */
export function compileDynamicRules(cwd, bundleRoot, targetFileName) {
  const bundleRulesDir = makePath(bundleRoot, "templates", "rules.d");
  const localRulesDir = makePath(cwd, DEUK_ROOT_DIR, "project-rules");
  
  const allRuleFiles = [];
  
  // 1. Gather global rules
  if (existsSync(bundleRulesDir)) {
    readdirSync(bundleRulesDir).forEach(f => {
      if (f.endsWith(".md")) allRuleFiles.push(makePath(bundleRulesDir, f));
    });
  }
  
  // 2. Gather local domain rules
  if (existsSync(localRulesDir)) {
    readdirSync(localRulesDir).forEach(f => {
      if (f.endsWith(".md")) allRuleFiles.push(makePath(localRulesDir, f));
    });
  }

  let compiledContent = "";

  for (const filePath of allRuleFiles) {
    try {
      const rawContent = readFileSync(filePath, "utf8");
      const { meta, content } = parseFrontMatter(rawContent);
      
      // Check if this rule is intended for the current target file (e.g., AGENTS.md)
      if (meta.inject_target && !meta.inject_target.includes(targetFileName)) {
        continue;
      }

      // Evaluate conditions
      let shouldInclude = true;
      if (meta.condition) {
        shouldInclude = evaluateCondition(meta.condition, cwd);
      }
      
      if (shouldInclude) {
        const sourceId = meta.id || basename(filePath);
        compiledContent += `\n<!-- RULE MODULE: ${sourceId} -->\n`;
        compiledContent += content.trim() + "\n";
      }
    } catch (err) {
      console.warn(`[WARNING] Skipping malformed rule file at ${filePath}:`, err.message);
      continue;
    }
  }

  return compiledContent.trim();
}

function normalizeProjects(projects, contextRoot) {
  if (!Array.isArray(projects)) return [];
  return projects
    .filter(p => p && typeof p.path === "string")
    .map(p => ({
      ...p,
      path: isAbsolute(p.path) ? resolve(p.path) : resolve(contextRoot, p.path)
    }));
}

/**
 * Attempts to locate and parse the DeukContext project registry from the workspace root.
 * Current deployments store projects in ingest.yaml; config.yaml remains a legacy fallback.
 */
function resolveDeukContextProjects(cwd) {
  // Go up directories until we find a sibling DeukAgentContext folder, or hit root
  let current = resolve(cwd);
  while (current && current !== "/") {
    const candidates = [
      makePath(current, "DeukAgentContext", ".local", "ingest.yaml"),
      makePath(current, "DeukAgentContext", ".local", "config.yaml"),
      makePath(current, "DeukContext", ".local", "ingest.yaml"),
      makePath(current, "DeukContext", ".local", "config.yaml") // Legacy fallback
    ];
    for (const candidatePath of candidates) {
      if (existsSync(candidatePath)) {
        try {
          const raw = readFileSync(candidatePath, "utf8");
          const parsed = YAML.parse(raw);
          const contextRoot = dirname(dirname(candidatePath));
          const projects = normalizeProjects(parsed?.projects, contextRoot);
          if (projects.length > 0) return projects;
        } catch (e) {
          console.error(`Failed to parse DeukContext registry at ${candidatePath}:`, e);
          return null;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Evaluates Frontmatter conditions to determine if a rule should be included.
 */
function evaluateCondition(condition, cwd) {
  if (!condition) return true;

  // Example: condition: { mcp: "deuk-agent-context" }
  if (condition.mcp === "deuk-agent-context" || condition.mcp === "deuk_agent_context") {
    const projects = resolveDeukContextProjects(cwd);
    if (!projects || projects.length === 0) return false;

    // Check if the current cwd is managed by DeukContext
    const isManaged = projects.some(p => {
      // If the project path is a prefix of cwd, it's managed
      return cwd.startsWith(p.path);
    });
    
    return isManaged;
  }

  return true;
}
