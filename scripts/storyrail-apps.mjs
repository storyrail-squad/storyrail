#!/usr/bin/env node
// StoryRail applications: which apps a story touches, where they are, and in which order they depend on each other.
// Everything comes from the backlog issue and from GitHub itself, so nothing is configured per application.
//
// Usage (from the hub root):
//   node scripts/storyrail-apps.mjs discover <N> [--issue <n>] [--apps "<id>,<id>>calls-id,..."]
//        Reads the "## Applications" section of backlog issue <n> (default N), finds each app as a repo in the GitHub
//        org (storyrail.config.json → github.org, or apps.map for names that don't match), detects frontend/backend,
//        clones or updates it into projects/<type>/<id>, finds its API contract, UI tests and API tests (also in a
//        separate API-tests repo when apps.map names one), works out the dependency order and writes
//        runs/issue-<N>/apps.json. --apps replaces the issue's section ("library-frontend>library-backend" = the
//        frontend calls the backend).
//   node scripts/storyrail-apps.mjs show <N>              the apps of run N, in dependency order
//   node scripts/storyrail-apps.mjs order <N>             their ids, providers first (the merge order)
//   node scripts/storyrail-apps.mjs repos <N>             every repo of run N (apps and their API-tests repos), merge order
//   node scripts/storyrail-apps.mjs sync <N>              put every repo of run N on an up-to-date default branch
//   node scripts/storyrail-apps.mjs branch <N> <branch>   create (or switch to) <branch> in every repo of run N
//   node scripts/storyrail-apps.mjs status <N>            branch, clean/dirty and last commit of every repo
//
// Exit code 0 = ok, 1 = something needs a person (an app not found, ambiguous, a cycle…), 2 = usage error.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { ROOT, config, fail as failWith, github, readApps, appsFile } from './lib/storyrail.mjs';

const TOOL = 'storyrail-apps';
const fail = (msg, code) => failWith(TOOL, msg, code);
const need = (msg) => {
  console.error(`${TOOL}: ${msg}`);
  process.exit(1);
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const opt = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// ---------- the story's Applications section ----------

/** [{ id, label, description }] from a "## Applications" section (bullets starting with the app name). */
function parseSection(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s*applications?\b/i.test(l.trim()));
  if (start < 0) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    const m = /^\s*[-*]\s+(?:\[[ xX]\]\s*)?[`*_]*([A-Za-z0-9][A-Za-z0-9._-]*)[`*_]*\s*(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[2].trim();
    const labelled = /^\(([^)]*)\)\s*[:\-–—]?\s*(.*)$/.exec(rest);
    out.push({ id: m[1], label: labelled ? labelled[1].trim() : '', description: (labelled ? labelled[2] : rest.replace(/^[:\-–—]\s*/, '')).trim() });
  }
  return out;
}

/** "a,b>a,c>b" → [{id, calls[]}] */
function parseOverride(spec) {
  return spec.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, ...calls] = s.split('>').map((x) => x.trim());
    return { id, label: '', description: calls.length ? `calls ${calls.join(', ')}` : '', calls };
  });
}

// ---------- GitHub lookups ----------

const mapOf = (id) => {
  const m = config.apps?.map?.[id];
  return typeof m === 'string' ? { repo: m } : (m ?? {});
};

async function findRepo(api, id) {
  const mapped = mapOf(id).repo;
  if (mapped) return (await api(`/repos/${mapped}`, { allow404: true })) ?? need(`apps.map says ${id} is ${mapped}, but that repo doesn't exist or you have no access`);
  const org = config.github?.org;
  if (!org) need(`can't look up ${id}: set github.org in storyrail.config.json (or add "${id}": "owner/repo" to apps.map)`);
  const exact = await api(`/repos/${org}/${id}`, { allow404: true });
  if (exact) return exact;
  const all = (await api(`/orgs/${org}/repos?per_page=100&type=all`, { allow404: true })) ?? (await api(`/users/${org}/repos?per_page=100`, { allow404: true })) ?? [];
  const low = id.toLowerCase();
  const pick = all.filter((r) => !r.archived && (r.name.toLowerCase() === low || r.name.toLowerCase().startsWith(`${low}-`)));
  if (pick.length === 1) return pick[0];
  if (!pick.length) need(`no repo for ${id} in ${org}. Add "${id}": "owner/repo" to apps.map in storyrail.config.json.`);
  return need(`${id} matches several repos: ${pick.map((r) => r.full_name).join(', ')}. Add "${id}": "owner/repo" to apps.map in storyrail.config.json.`);
}

async function detectType(api, repo) {
  const list = (await api(`/repos/${repo.full_name}/contents/?ref=${encodeURIComponent(repo.default_branch)}`, { allow404: true })) ?? [];
  const names = new Set(list.map((t) => t.name));
  const java = names.has('pom.xml') || names.has('build.gradle') || names.has('build.gradle.kts');
  const node = names.has('package.json');
  if (java && !node) return 'backend';
  if (node && !java) return 'frontend';
  return null;
}

// ---------- local detection in a clone ----------

const SKIP = new Set(['node_modules', '.git', 'target', 'build', 'dist', 'coverage', '.idea', 'playwright-report', 'test-results']);
function walk(dir, found = [], depth = 0) {
  if (depth > 8) return found;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.app-dist')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, found, depth + 1);
    else found.push(p);
  }
  return found;
}
function apiTitle(file) {
  try {
    const head = readFileSync(file, 'utf8').split('\n').slice(0, 60).join('\n');
    const m = /^\s{2,}title:\s*["']?(.+?)["']?\s*$/m.exec(head) ?? /"title"\s*:\s*"([^"]+)"/.exec(head);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}
function inspect(dir) {
  const files = walk(dir).map((f) => relative(dir, f).split(sep).join('/'));
  const contracts = files.filter((f) => /(openapi|swagger)[^/]*\.(ya?ml|json)$/i.test(f.split('/').pop())).map((path) => ({ path, title: apiTitle(join(dir, path)) }));
  const pw = files.find((f) => /(^|\/)playwright\.config\.(ts|js|mjs|cjs)$/.test(f));
  const features = files.filter((f) => f.endsWith('.feature'));
  let apiTests = null;
  if (features.length) {
    const parts = features.map((f) => f.split('/').slice(0, -1));
    const common = parts.reduce((a, b) => a.slice(0, a.findIndex((x, i) => x !== b[i]) < 0 ? a.length : a.findIndex((x, i) => x !== b[i])));
    apiTests = common.join('/') || '.';
  }
  return { contracts, uiTests: pw ? dirname(pw) : null, apiTests, features: features.length };
}

function cloneOrUpdate(r) {
  const dir = join(ROOT, r.path);
  if (existsSync(join(dirname(dir), '.git'))) {
    need(`${relative(ROOT, dirname(dir))} is a clone from the old layout (one project per folder). Apps now live in projects/<type>/<app>: push or discard its work, delete ${relative(ROOT, dirname(dir))}, and run this again.`);
  }
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dirname(dir), { recursive: true });
    execFileSync('git', ['clone', '--quiet', '--branch', r.defaultBranch, r.cloneUrl, dir], { stdio: 'inherit' });
    return 'cloned';
  }
  if (git(dir, 'status', '--porcelain')) need(`${r.path} has uncommitted changes; commit, stash or discard them first`);
  git(dir, 'fetch', '--quiet', 'origin');
  git(dir, 'switch', '--quiet', r.defaultBranch);
  git(dir, 'pull', '--quiet', '--ff-only');
  return 'updated';
}

/** Providers first; null on a cycle. */
function topo(apps) {
  const ids = new Set(apps.map((a) => a.id));
  const done = [];
  const seen = new Set();
  const temp = new Set();
  const visit = (a) => {
    if (seen.has(a.id)) return true;
    if (temp.has(a.id)) return false;
    temp.add(a.id);
    for (const c of a.consumes.filter((x) => ids.has(x))) if (!visit(apps.find((x) => x.id === c))) return false;
    temp.delete(a.id);
    seen.add(a.id);
    done.push(a.id);
    return true;
  };
  for (const a of apps) if (!visit(a)) return null;
  return done;
}

/** Every repo of the run in merge order: each app, then its API-tests repo. */
function repos(data) {
  return data.order.flatMap((id) => {
    const a = data.apps.find((x) => x.id === id);
    return [{ ...a, name: a.id }, ...(a.apiTestsRepo ? [{ ...a.apiTestsRepo, name: a.apiTestsRepo.id, of: a.id }] : [])];
  });
}

function table(data) {
  const lines = [`Applications of run ${data.issue} (dependency order: ${data.order.join(' → ')})`];
  for (const id of data.order) {
    const a = data.apps.find((x) => x.id === id);
    lines.push(`- ${a.id}${a.label ? ` (${a.label})` : ''} · ${a.type} · ${a.repo} · ${a.path}`);
    if (a.consumes.length) lines.push(`    calls: ${a.consumes.join(', ')}`);
    if (a.consumesOutside.length) lines.push(`    calls (not changed in this story): ${a.consumesOutside.join(', ')}`);
    lines.push(`    contract: ${a.contract ?? 'none found'}${a.contractCopies.length ? ` · copies: ${a.contractCopies.map((c) => `${c.path} (of ${c.of})`).join(', ')}` : ''}`);
    if (a.type === 'frontend') lines.push(`    UI tests: ${a.uiTests ?? 'none found'}`);
    if (a.type === 'backend') lines.push(`    API tests: ${a.apiTestsRepo ? `${a.apiTestsRepo.repo} → ${a.apiTestsRepo.path}/${a.apiTestsRepo.apiTests ?? ''}` : a.apiTests ?? 'none found'}`);
    if (a.qaUrl) lines.push(`    QA: ${a.qaUrl}`);
    if (a.description) lines.push(`    story: ${a.description}`);
  }
  return lines.join('\n');
}

const [cmd, n, ...args] = process.argv.slice(2);
if (cmd && cmd !== 'help' && !n) fail(`${cmd} needs the run number N (runs/issue-<N>)`);

switch (cmd) {
  case 'discover': {
    const { api } = github(TOOL);
    const iid = opt(args, '--issue') ?? n;
    let listed;
    if (opt(args, '--apps')) listed = parseOverride(opt(args, '--apps'));
    else {
      const backlog = config.backlog?.repo;
      if (!backlog) fail('set backlog.repo in storyrail.config.json');
      const issue = await api(`/repos/${backlog}/issues/${iid}`);
      listed = parseSection(issue.body);
      if (!listed?.length) need(`issue #${iid} has no "## Applications" section. Name the apps with --apps "<id>,<id>><called id>,…"`);
    }
    const ids = listed.map((a) => a.id);
    const apps = [];
    for (const item of listed) {
      const repo = await findRepo(api, item.id);
      const m = mapOf(item.id);
      const type = m.type ?? (await detectType(api, repo));
      if (!type) need(`can't tell whether ${item.id} (${repo.full_name}) is a frontend or a backend; add { "repo": "${repo.full_name}", "type": "frontend|backend" } to apps.map`);
      const mentioned = (item.calls ?? []).length
        ? item.calls
        : [...new Set([...item.description.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]*/g)].map((x) => x[0]))].filter((w) => w.toLowerCase() !== item.id.toLowerCase() && w.includes('-'));
      const app = {
        id: item.id,
        type,
        repo: repo.full_name,
        webUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch ?? 'main',
        path: `projects/${type}/${item.id}`,
        qaUrl: m.qaUrl ?? (repo.homepage || null),
        label: item.label ?? '',
        description: item.description,
        consumes: mentioned.filter((w) => ids.some((i) => i.toLowerCase() === w.toLowerCase())).map((w) => ids.find((i) => i.toLowerCase() === w.toLowerCase())),
        // other apps it calls that this story doesn't change: names with the same prefix as the story's apps (library-…)
        consumesOutside: mentioned.filter((w) => !ids.some((i) => i.toLowerCase() === w.toLowerCase()) && ids.some((i) => w.toLowerCase().startsWith(`${i.split('-')[0].toLowerCase()}-`))),
      };
      const how = cloneOrUpdate(app);
      Object.assign(app, inspect(join(ROOT, app.path)), { clone: how });
      // API tests kept in a repo of their own (apps.map → "apiTests": "owner/repo")
      if (type === 'backend' && m.apiTests) {
        const t = m.apiTests.includes('/') ? await api(`/repos/${m.apiTests}`) : await findRepo(api, m.apiTests);
        const companion = { id: t.name, repo: t.full_name, webUrl: t.html_url, cloneUrl: t.clone_url, defaultBranch: t.default_branch ?? 'main', path: `projects/api-tests/${t.name}` };
        companion.clone = cloneOrUpdate(companion);
        const found = inspect(join(ROOT, companion.path));
        Object.assign(companion, { apiTests: found.apiTests, features: found.features, contracts: found.contracts });
        app.apiTestsRepo = companion;
      }
      apps.push(app);
    }
    // The app's own contract, and the copies of a provider's contract (same API title) that callers and API-tests repos keep.
    for (const a of apps) {
      const providers = apps.filter((p) => a.consumes.includes(p.id));
      const copyOf = (c) => (c.title ? providers.find((p) => p.contracts.some((pc) => pc.title === c.title)) : undefined);
      a.contractCopies = a.contracts.filter((c) => copyOf(c)).map((c) => ({ path: c.path, of: copyOf(c).id }));
      const own = a.contracts.filter((c) => !copyOf(c)).map((c) => c.path);
      a.contract = a.type === 'backend' ? (own.find((p) => /(^|\/)(docs\/api|src\/main\/resources)\//.test(p)) ?? own[0] ?? null) : null;
    }
    for (const a of apps) {
      if (a.apiTestsRepo) {
        const titles = new Set(a.contracts.map((c) => c.title).filter(Boolean));
        a.apiTestsRepo.contractCopies = a.apiTestsRepo.contracts.filter((c) => titles.has(c.title)).map((c) => ({ path: c.path, of: a.id }));
        delete a.apiTestsRepo.contracts;
      }
    }
    for (const a of apps) delete a.contracts;
    const order = topo(apps);
    if (!order) need(`the applications call each other in a cycle: ${apps.map((a) => `${a.id}→${a.consumes.join('/') || '-'}`).join(', ')}`);
    const data = { issue: /^\d+$/.test(n) ? Number(n) : n, story: Number(iid) || null, generatedAt: new Date().toISOString(), apps, order };
    mkdirSync(dirname(appsFile(n)), { recursive: true });
    writeFileSync(appsFile(n), `${JSON.stringify(data, null, 2)}\n`);
    console.log(table(data));
    console.log(`\nSaved ${relative(ROOT, appsFile(n))}`);
    break;
  }
  case 'show':
  case 'order':
  case 'repos': {
    const data = readApps(n) ?? need(`no ${relative(ROOT, appsFile(n))} yet: run discover first`);
    if (cmd === 'order') console.log(data.order.join(' '));
    else if (cmd === 'repos') for (const r of repos(data)) console.log(`${r.name}\t${r.repo}\t${r.path}${r.of ? `\t(API tests of ${r.of})` : ''}`);
    else console.log(table(data));
    break;
  }
  case 'sync': {
    const data = readApps(n) ?? need(`no ${relative(ROOT, appsFile(n))} yet: run discover first`);
    for (const r of repos(data)) console.log(`${r.name}: ${cloneOrUpdate(r)} · ${r.path} on ${r.defaultBranch}`);
    break;
  }
  case 'branch': {
    const [branch] = args;
    if (!branch) fail('branch needs the branch name');
    const data = readApps(n) ?? need(`no ${relative(ROOT, appsFile(n))} yet: run discover first`);
    for (const r of repos(data)) {
      const dir = join(ROOT, r.path);
      const exists = git(dir, 'branch', '--list', branch);
      git(dir, 'switch', '--quiet', ...(exists ? [branch] : ['-c', branch]));
      console.log(`${r.name}: on ${branch}`);
    }
    break;
  }
  case 'status': {
    const data = readApps(n) ?? need(`no ${relative(ROOT, appsFile(n))} yet: run discover first`);
    for (const r of repos(data)) {
      const dir = join(ROOT, r.path);
      if (!existsSync(join(dir, '.git'))) {
        console.log(`${r.name}: not cloned`);
        continue;
      }
      const dirty = git(dir, 'status', '--porcelain') ? 'uncommitted changes' : 'clean';
      console.log(`${r.name}: ${r.path} · ${git(dir, 'branch', '--show-current')} · ${dirty} · ${git(dir, 'log', '-1', '--format=%h %s')}`);
    }
    break;
  }
  default:
    fail('commands: discover, show, order, repos, sync, branch, status');
}
