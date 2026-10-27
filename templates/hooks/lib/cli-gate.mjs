import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execPath, platform } from 'node:process';
import { createRequire } from 'node:module';

const PACKAGE_ENTRY = 'deuk-agent-flow/bin/deuk-agent-flow.js';

function fromNodeModules() {
  const roots = [dirname(execPath), join(dirname(execPath), '..'), process.cwd()];
  for (const root of roots) {
    const candidate = join(root, 'node_modules', 'deuk-agent-flow', 'bin', 'deuk-agent-flow.js');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function fromRequire() {
  for (const base of [import.meta.url, `file://${process.cwd()}/`]) {
    try {
      return createRequire(base).resolve(PACKAGE_ENTRY);
    } catch {}
  }
  return null;
}

function fromPath() {
  const finder = platform === 'win32' ? 'where' : 'which';
  let found;
  try {
    found = execFileSync(finder, ['deuk-agent-flow'], { encoding: 'utf8' }).split('\n')[0].trim();
  } catch {
    return null;
  }
  if (!found) return null;
  try {
    const real = realpathSync(found);
    if (real.endsWith('.js')) return real;
    const sibling = join(dirname(real), 'node_modules', 'deuk-agent-flow', 'bin', 'deuk-agent-flow.js');
    if (existsSync(sibling)) return sibling;
  } catch {}
  return null;
}

export function resolveCliEntry() {
  const override = process.env.DEUK_CLI_ENTRY;
  if (override && existsSync(override)) return { entry: override, via: 'env' };
  const require = fromRequire();
  if (require) return { entry: require, via: 'require' };
  const modules = fromNodeModules();
  if (modules) return { entry: modules, via: 'node_modules' };
  const path = fromPath();
  if (path) return { entry: path, via: 'path' };
  return { entry: null, via: 'none' };
}

const DEADLINE_MS = 4000;
const QUIET_MS = 150;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

function logLine(name, fields) {
  try {
    const dir = join(homedir(), '.deuk', 'persona');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `gate-${name}.log`), `${new Date().toISOString()}\t${name}\t${fields}\n`);
  } catch {}
}

export async function runCliGate(name, args) {
  const payload = await readStdin();
  const started = Date.now();

  const { entry, via } = resolveCliEntry();
  if (!entry) {
    logLine(name, 'status=no-entry\tms=0\tout=0');
    process.exit(0);
  }

  const child = spawn(execPath, [entry, ...args], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });

  let out = '';
  let settled = false;

  const finish = (status) => {
    if (settled) return;
    settled = true;
    const elapsed = Date.now() - started;
    logLine(name, `status=${status}\tvia=${via}\tms=${elapsed}\tout=${out.length}`);
    if (out.trim()) process.stdout.write(out);
    process.exit(0);
  };

  let settleTimer = null;

  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {}
    finish(out ? 'timeout-with-output' : 'timeout');
  }, DEADLINE_MS);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    out += chunk;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {}
      finish('settled');
    }, QUIET_MS);
  });

  child.on('error', () => {
    clearTimeout(timer);
    if (settleTimer) clearTimeout(settleTimer);
    out = '';
    finish('spawn-error');
  });

  child.stdout.on('end', () => {
    clearTimeout(timer);
    if (settleTimer) clearTimeout(settleTimer);
    finish('ok');
  });

  child.stdin.on('error', () => {});
  child.stdin.end(payload);
}
