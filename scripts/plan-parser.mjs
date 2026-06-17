/**
 * Generic Markdown Plan Parser
 * 
 * Supports various AI Agent Plan formats (Antigravity, Copilot, etc.)
 * Extracts basic ticket fields (title, summary, tasks) and body.
 */

export function parseGenericMarkdownPlan(content) {
  const lines = content.split('\n');
  
  // 1. Title: First H1
  const h1Line = lines.find(l => /^# /.test(l));
  const title = h1Line ? h1Line.replace(/^# /, '').trim() : '';

  // 2. Summary: Text between H1 and the first --- or ##
  const h1Idx = h1Line ? lines.indexOf(h1Line) : -1;
  let summaryLines = [];
  for (let i = h1Idx + 1; i < lines.length; i++) {
    if (/^---$/.test(lines[i].trim()) || /^## /.test(lines[i])) break;
    if (lines[i].trim()) summaryLines.push(lines[i].trim());
  }
  const summary = summaryLines.join(' ').slice(0, 200);

  // 3. Tasks: Collect all checklist items
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
