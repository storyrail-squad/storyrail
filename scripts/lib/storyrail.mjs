// Shared helpers for the StoryRail scripts: the config, GitHub access, and the run's applications.
// Plain Node (18+), no dependencies.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const config = JSON.parse(readFileSync(join(ROOT, 'storyrail.config.json'), 'utf8'));

export function fail(tool, msg, code = 2) {
  console.error(`${tool}: ${msg}`);
  process.exit(code);
}

// ---------- GitHub ----------

/** GitHub REST with the token of `gh auth login` (or GITHUB_TOKEN). `api(path)` returns parsed JSON, or null on 404. */
export function github(tool) {
  const base = String(config.github?.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '');
  let token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not logged in */ }
  }
  if (!token) fail(tool, 'no GitHub token: run `gh auth login` (or set GITHUB_TOKEN)');
  async function api(path, { allow404 = false } = {}) {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (res.status === 404 && allow404) return null;
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).message ?? text; } catch { /* not JSON */ }
      console.error(`${tool}: GET ${path} → HTTP ${res.status}: ${String(msg).slice(0, 300)}`);
      process.exit(1);
    }
    return text ? JSON.parse(text) : null;
  }
  return { api, base };
}

// ---------- the run's applications (runs/issue-<N>/apps.json, written by storyrail-apps.mjs) ----------

export const runDir = (n) => join(ROOT, 'runs', `issue-${n}`);
export const appsFile = (n) => join(runDir(n), 'apps.json');

export function readApps(n) {
  const f = appsFile(n);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/** The newest apps.json in runs/ (the run in progress). */
export function latestApps() {
  const dir = join(ROOT, 'runs');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .map((d) => join(dir, d, 'apps.json'))
    .filter((f) => existsSync(f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files.length ? JSON.parse(readFileSync(files[0], 'utf8')) : null;
}
