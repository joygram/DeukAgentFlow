/**
 * Generic Markdown Plan Parser
 * 
 * Supports various AI Agent Plan formats (Antigravity, Copilot, etc.)
 * Extracts basic ticket fields (title, summary, tasks) and body.
 */
import { parseHeadingAtDepth } from "./markdown-headings.js";

export function parseGenericMarkdownPlan(content) {
  const lines = content.split('\n');
  
  const h1Line = lines.find(l => parseHeadingAtDepth(l, 1));
  const title = h1Line ? parseHeadingAtDepth(h1Line, 1).text : '';

  const h1Idx = h1Line ? lines.indexOf(h1Line) : -1;
  let summaryLines = [];
  for (let i = h1Idx + 1; i < lines.length; i++) {
    if (/^---$/.test(lines[i].trim()) || parseHeadingAtDepth(lines[i], 2)) break;
    if (lines[i].trim()) summaryLines.push(lines[i].trim());
  }
  const summary = summaryLines.join(' ').slice(0, 200);

  const tasks = lines
    .filter(l => /^\s*- \[[ x/]\]/.test(l))
    .map(l => l.replace(/^\s*- \[[ x/]\]\s*/, '').trim());

  return { title, summary, tasks, body: content };
}

/**
 * Detect agent type from plan path
 */
export function detectAgentFromPath(planPath) {
  if (planPath.includes('.gemini')) return 'antigravity';
  if (planPath.includes('copilot') || planPath.includes('.codex')) return 'copilot';
  if (planPath.includes('.cursor')) return 'cursor';
  if (planPath.includes('.claude')) return 'claude';
  return 'generic';
}

export const PLAN_PARSERS = {
  'antigravity': parseGenericMarkdownPlan,
  'copilot': parseGenericMarkdownPlan,
  'generic': parseGenericMarkdownPlan
};

export function parsePlan(planPath, content) {
  const agent = detectAgentFromPath(planPath);
  const parser = PLAN_PARSERS[agent] || parseGenericMarkdownPlan;
  return parser(content);
}
