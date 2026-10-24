#!/usr/bin/env node
// StoryRail run status — the single place agents report progress.
// Writes .storyrail/status.json, which the local dashboard (scripts/storyrail-dashboard.mjs) polls.
//
// Usage:
//   node scripts/storyrail-status.mjs start <issues> [title...]        new run, resets every station
//   node scripts/storyrail-status.mjs set <station> <status> [progress] [note...]
//   node scripts/storyrail-status.mjs log <station> <ok|warn|bad|info> <message...>
//   node scripts/storyrail-status.mjs run <key> <value...>             e.g. run phase "Build"
//   node scripts/storyrail-status.mjs loop <bug issues>                 defect loop inside a story run: resets fetch→QA stations, keeps the run
//   node scripts/storyrail-status.mjs metric <unit-fe|unit-be|api|ui> <passed> <total>
//   node scripts/storyrail-status.mjs findings <blocker> <major> <minor> <fixed>   (blocker/major/minor = still open; fixed = fixed so far)
//   node scripts/storyrail-status.mjs security <high-critical vulns> <lint warnings>
//   node scripts/storyrail-status.mjs eval <exam> <story> <run> <runs> <nth> <of> [label...]   exam banner on the dashboard
//   node scripts/storyrail-status.mjs eval off
//   node scripts/storyrail-status.mjs end
//   node scripts/storyrail-status.mjs show
//
// Stations: req-fetch fe-dev be-dev ui-tests api-tests reviewer gate fixer cicd smoke qa-api manual-tests signoff
// Statuses: pending running done failed skipped waiting

import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.storyrail');
const FILE = join(DIR, 'status.json');
const LOCK = join(DIR, 'status.lock');

const STATIONS = ['req-fetch', 'fe-dev', 'be-dev', 'ui-tests', 'api-tests', 'reviewer', 'gate', 'fixer', 'cicd', 'smoke', 'qa-api', 'manual-tests', 'signoff'];
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
      for (const st of STATIONS) s.agents[st] = { status: 'pending', progress: 0, note: '' };
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
    if (!STATIONS.includes(station)) fail(`unknown station "${station}". Use one of: ${STATIONS.join(' ')}`);
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
  case 'metric': {
    const [name, passed, total] = args;
    if (!['unit-fe', 'unit-be', 'api', 'ui'].includes(name)) fail('metric name must be unit-fe, unit-be, api or ui');
    if (Number.isNaN(Number(passed)) || Number.isNaN(Number(total))) fail('metric needs <passed> <total> numbers');
    withLock(() => {
      const s = load();
      s.run.metrics ??= {};
      s.run.metrics[name] = { passed: Number(passed), total: Number(total) };
      // The dashboard shows one unit-test tile: frontend + backend together.
      const parts = ['unit-fe', 'unit-be'].map((k) => s.run.metrics[k]).filter(Boolean);
      if (parts.length) {
        s.run.metrics.unit = parts.reduce((a, m) => ({ passed: a.passed + m.passed, total: a.total + m.total }), { passed: 0, total: 0 });
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
    fail('commands: start, loop, set, log, run, metric, findings, security, eval, end, show');
}
