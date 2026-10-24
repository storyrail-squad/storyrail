#!/usr/bin/env node
// StoryRail run status — the single place agents report progress.
// Writes .storyrail/status.json, which the local dashboard (scripts/storyrail-dashboard.mjs) polls.
//
// Usage:
//   node scripts/storyrail-status.mjs start <issues> [title...]        new run, resets every station
//   node scripts/storyrail-status.mjs set <station> <status> [progress] [note...]
//   node scripts/storyrail-status.mjs log <station> <ok|warn|bad|info> <message...>
//   node scripts/storyrail-status.mjs run <key> <value...>             e.g. run phase "Build"
//   node scripts/storyrail-status.mjs loop <bug issues>                 defect loop inside a story run: resets every station, keeps the run
//   node scripts/storyrail-status.mjs apps <N>                          the run's applications (from runs/issue-<N>/apps.json)
//   node scripts/storyrail-status.mjs metric <unit|api|ui>@<app> <passed> <total>
//   node scripts/storyrail-status.mjs findings <blocker> <major> <minor> <fixed>   (blocker/major/minor = still open; fixed = fixed so far)
//   node scripts/storyrail-status.mjs security <high-critical vulns> <lint warnings>
//   node scripts/storyrail-status.mjs eval <exam> <story> <run> <runs> <nth> <of> [label...]   exam banner on the dashboard
//   node scripts/storyrail-status.mjs eval off
//   node scripts/storyrail-status.mjs end
//   node scripts/storyrail-status.mjs show
//
// Stations: req-fetch reviewer gate fixer cicd smoke qa-api manual-tests signoff, and per application dev@<app> tests@<app>
// Statuses: pending running done failed skipped waiting

import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.storyrail');
const FILE = join(DIR, 'status.json');
const LOCK = join(DIR, 'status.lock');

// Fixed stations, plus two per application of the run (set with `apps`): dev@<app> and tests@<app>.
const STATIONS = ['req-fetch', 'reviewer', 'gate', 'fixer', 'cicd', 'smoke', 'qa-api', 'manual-tests', 'signoff'];
const APP_STATION = /^(dev|tests)@([A-Za-z0-9._-]+)$/;
const STATUSES = ['pending', 'running', 'done', 'failed', 'skipped', 'waiting'];
const LEVELS = ['ok', 'warn', 'bad', 'info'];
const MAX_FEED = 200;

function fail(msg) {
  console.error(`storyrail-status: ${msg}`);
  process.exit(2);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Parallel agents report at the same time, so read-modify-write is guarded by a lock file.
function withLock(fn) {
  mkdirSync(DIR, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx');
      try {
        return fn();
      } finally {
        closeSync(fd);
        unlinkSync(LOCK);
      }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 10_000) unlinkSync(LOCK); // stale lock
      } catch { /* lock vanished: retry */ }
      sleep(50);
    }
  }
  return fail('could not acquire the status lock');
}

function emptyState() {
  return { run: {}, agents: Object.fromEntries(STATIONS.map((s) => [s, { status: 'pending', progress: 0, note: '' }])), feed: [] };
}

function load() {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return emptyState();
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE);
}

function addFeed(state, agent, level, msg) {
  state.feed.push({ t: new Date().toISOString(), agent, level, msg });
  if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'start': {
    const [issues, ...title] = args;
    if (!issues) fail('start needs the issue numbers, e.g. start "46,47" "Loan history"');
    withLock(() => {
      const s = emptyState();
      s.run = {
        issues: issues.split(',').map((n) => n.trim()).filter(Boolean),
        title: title.join(' ') || `Issue ${issues}`,
        phase: 'Requirements',
        startedAt: new Date().toISOString(),
        metrics: {},
      };
      addFeed(s, 'orchestrator', 'info', `Run started for issue(s) ${issues}`);
      save(s);
    });
    break;
  }
  case 'loop': {
    const [bugs] = args;
    if (!bugs) fail('loop needs the bug issue numbers, e.g. loop "50,51"');
    withLock(() => {
      const s = load();
      for (const st of Object.keys(s.agents)) s.agents[st] = { status: 'pending', progress: 0, note: '' };
      s.run.bugs = bugs.split(',').map((n) => n.trim()).filter(Boolean);
      s.run.phase = 'Defect loop';
      delete s.run.endedAt;
      addFeed(s, 'orchestrator', 'info', `Defect loop started for bug(s) ${bugs}`);
      save(s);
    });
    break;
  }
  case 'set': {
    const [station, status, progress, ...note] = args;
    const known = () => [...STATIONS, ...(load().run.apps ?? []).flatMap((a) => ['dev', 'tests'].map((k) => `${k}@${a.id}`))];
    if (!known().includes(station)) {
      fail(APP_STATION.test(station) ? `unknown application in "${station}": run \`apps <N>\` first, or check the name. Known: ${known().join(' ')}` : `unknown station "${station}". Use one of: ${known().join(' ')}`);
    }
    if (!STATUSES.includes(status)) fail(`unknown status "${status}". Use one of: ${STATUSES.join(' ')}`);
    const pct = progress === undefined ? undefined : Number(progress);
    if (pct !== undefined && (Number.isNaN(pct) || pct < 0 || pct > 100)) fail('progress must be 0-100');
    withLock(() => {
      const s = load();
      const cur = s.agents[station] ?? {};
      s.agents[station] = {
        status,
        progress: status === 'done' ? 100 : pct ?? cur.progress ?? 0,
        note: note.length ? note.join(' ').slice(0, 80) : cur.note ?? '',
      };
      save(s);
    });
    break;
  }
  case 'log': {
    const [station, level, ...msg] = args;
    if (!station || !LEVELS.includes(level) || !msg.length) fail('log needs <station> <ok|warn|bad|info> <message>');
    withLock(() => {
      const s = load();
      addFeed(s, station, level, msg.join(' ').slice(0, 300));
      save(s);
    });
    break;
  }
  case 'run': {
    const [key, ...value] = args;
    if (!['phase', 'summary', 'title', 'repo'].includes(key)) fail('run key must be phase, summary, title or repo');
    withLock(() => {
      const s = load();
      s.run[key] = value.join(' ');
      save(s);
    });
    break;
  }
  case 'apps': {
    const [n] = args;
    const file = join(ROOT, 'runs', `issue-${n}`, 'apps.json');
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      fail(`apps needs the run number N with a runs/issue-<N>/apps.json (node scripts/storyrail-apps.mjs discover <N>)`);
    }
    withLock(() => {
      const s = load();
      s.run.apps = data.order.map((id) => {
        const a = data.apps.find((x) => x.id === id);
        return { id: a.id, type: a.type, label: a.label ?? '', consumes: a.consumes ?? [], apiTestsRepo: a.apiTestsRepo?.id ?? null };
      });
      for (const a of s.run.apps) for (const k of ['dev', 'tests']) s.agents[`${k}@${a.id}`] ??= { status: 'pending', progress: 0, note: '' };
      addFeed(s, 'orchestrator', 'info', `Applications: ${s.run.apps.map((a) => a.id).join(' → ')}`);
      save(s);
    });
    break;
  }
  case 'metric': {
    const [name, passed, total] = args;
    const m = /^(unit|api|ui)(?:@([A-Za-z0-9._-]+))?$/.exec(name ?? '');
    if (!m) fail('metric name must be unit, api or ui, optionally @<app>, e.g. unit@library-backend');
    if (Number.isNaN(Number(passed)) || Number.isNaN(Number(total))) fail('metric needs <passed> <total> numbers');
    withLock(() => {
      const s = load();
      s.run.metrics ??= {};
      s.run.metrics.byApp ??= {};
      s.run.metrics.byApp[name] = { passed: Number(passed), total: Number(total) };
      // The dashboard shows one tile per kind: every application added up.
      for (const kind of ['unit', 'api', 'ui']) {
        const parts = Object.entries(s.run.metrics.byApp).filter(([k]) => k === kind || k.startsWith(`${kind}@`)).map(([, v]) => v);
        if (parts.length) s.run.metrics[kind] = parts.reduce((a, x) => ({ passed: a.passed + x.passed, total: a.total + x.total }), { passed: 0, total: 0 });
      }
      save(s);
    });
    break;
  }
  case 'security': {
    const [vulns, lint] = args.map(Number);
    if ([vulns, lint].some((n) => Number.isNaN(n))) fail('security needs 2 numbers: <high-critical vulns> <lint warnings>');
    withLock(() => {
      const s = load();
      s.run.metrics ??= {};
      s.run.metrics.security = { vulns, lint };
      save(s);
    });
    break;
  }
  case 'findings': {
    const [blocker, major, minor, fixed] = args.map(Number);
    if ([blocker, major, minor, fixed].some((n) => Number.isNaN(n))) fail('findings needs 4 numbers: blocker major minor fixed');
    withLock(() => {
      const s = load();
      s.run.metrics ??= {};
      s.run.metrics.review = { blocker, major, minor, fixed };
      save(s);
    });
    break;
  }
  case 'eval': {
    // Exam runs (scripts/storyrail-eval.mjs) show a banner: practice story, run k of n, nothing merged or deployed.
    const [exam, storyId, run, runs, nth, of, ...label] = args;
    if (!exam) fail('eval needs <exam> <story> <run> <runs> <nth> <of> [label], or: eval off');
    withLock(() => {
      const s = load();
      if (exam === 'off') delete s.run.eval;
      else s.run.eval = { exam, story: storyId, run: Number(run), runs: Number(runs), nth: Number(nth), of: Number(of), label: label.join(' ') };
      save(s);
    });
    break;
  }
  case 'end': {
    withLock(() => {
      const s = load();
      s.run.endedAt = new Date().toISOString();
      save(s);
    });
    break;
  }
  case 'show':
    console.log(JSON.stringify(load(), null, 2));
    break;
  default:
    fail('commands: start, apps, loop, set, log, run, metric, findings, security, eval, end, show');
}
