import { join, basename, resolve, dirname } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import { parseFrontMatter, AGENT_ROOT_DIR } from "./cli-utils.mjs";
import YAML from "yaml";

/**
 * Scans directories for rule markdown files, evaluates their Frontmatter conditions,
 * and compiles a single rule string for injection.
 */
export function compileDynamicRules(cwd, bundleRoot, targetFileName) {
  const bundleRulesDir = join(bundleRoot, "templates", "rules.d");
  const localRulesDir = join(cwd, AGENT_ROOT_DIR, "project-rules");
  
  const allRuleFiles = [];
  
  // 1. Gather global rules
  if (existsSync(bundleRulesDir)) {
    readdirSync(bundleRulesDir).forEach(f => {
      if (f.endsWith(".md")) allRuleFiles.push(join(bundleRulesDir, f));
    });
  }
  
  // 2. Gather local domain rules
  if (existsSync(localRulesDir)) {
    readdirSync(localRulesDir).forEach(f => {
      if (f.endsWith(".md")) allRuleFiles.push(join(localRulesDir, f));
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

/**
 * Attempts to locate and parse the DeukContext config.yaml from the workspace root.
 */
function resolveDeukContextConfig(cwd) {
  // Go up directories until we find a sibling DeukAgentContext folder, or hit root
  let current = resolve(cwd);
  while (current && current !== "/") {
    const candidates = [
      join(current, "DeukAgentContext", ".local", "config.yaml"),
      join(current, "DeukContext", ".local", "config.yaml") // Legacy fallback
    ];
    for (const candidatePath of candidates) {
      if (existsSync(candidatePath)) {
        try {
          const raw = readFileSync(candidatePath, "utf8");
          return YAML.parse(raw);
        } catch (e) {
          console.error("Failed to parse DeukContext config.yaml:", e);
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
    const ragConfig = resolveDeukContextConfig(cwd);
    if (!ragConfig || !ragConfig.projects) return false;

    // Check if the current cwd is managed by DeukContext
    const isManaged = ragConfig.projects.some(p => {
      // If the project path is a prefix of cwd, it's managed
      return cwd.startsWith(p.path);
    });
    
    return isManaged;
  }

  return true;
}
