#!/usr/bin/env node
// StoryRail exams (evaluation-driven development): is the squad still as good as before?
// The full squad builds fixed practice stories from frozen code, several times, and hidden tests the agents never see
// grade each run. Results go to evals/results/<exam>.json (commit them): that history is what later exams compare with.
// Nothing is pushed, merged or deployed. See evals/README.md.
//
// Usage (the orchestrator runs these during /storyrail eval; you can run them by hand too):
//   node scripts/storyrail-eval.mjs validate                                  check evals/evals.json and its files
//   node scripts/storyrail-eval.mjs start --reason baseline|tool|change [--label "…"] [--detail "…"]
//   node scripts/storyrail-eval.mjs prepare <story> <run>                     frozen code on a local eval branch, run folder, dashboard banner
//   node scripts/storyrail-eval.mjs grade <story> <run> --major <n> --rounds <n> --human <n>
//   node scripts/storyrail-eval.mjs finish                                    verdict, clean up, back to main
//   node scripts/storyrail-eval.mjs report [<exam>] [--vs <exam>]             verdict of an exam (default: the latest)
//   node scripts/storyrail-eval.mjs list
//   node scripts/storyrail-eval.mjs check <story>                             hidden tests against the frozen code (should mostly fail)
//
// Exit codes: 0 ok, 1 a check failed (dirty project, service not up, verdict "worse" for report), 2 usage error.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(join(ROOT, 'storyrail-dashboard', 'evals-core.js'));
const EVALS = join(ROOT, 'evals');
const RESULTS = join(EVALS, 'results');
const STATE = join(ROOT, '.storyrail', 'eval.json');
const TOOL = 'storyrail-eval';

function fail(msg, code = 2) {
  console.error(`${TOOL}: ${msg}`);
  process.exit(code);
}
const readJson = (f, fb) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`); };

const cfg = readJson(join(EVALS, 'evals.json'), null);
if (!cfg) fail('evals/evals.json is missing or not valid JSON');
const hub = readJson(join(ROOT, 'storyrail.config.json'), {});
const HIDDEN = resolve(ROOT, cfg.hiddenDir ?? 'evals/hidden');

// ---------- arguments ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
const pos = [];
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
  else pos.push(argv[i]);
}
const num = (k) => {
  const v = Number(flags[k]);
  if (flags[k] === undefined || Number.isNaN(v) || v < 0) fail(`--${k} <number ≥ 0> is required`);
  return v;
};

// ---------- helpers ----------
const story = (id) => cfg.stories.find((s) => s.id.toLowerCase() === String(id).toLowerCase()) ?? fail(`unknown practice story "${id}". Known: ${cfg.stories.map((s) => s.id).join(', ')}`);
const runNo = (r) => { const n = Number(r); if (!Number.isInteger(n) || n < 1 || n > (cfg.runsPerStory ?? 3)) fail(`run must be 1–${cfg.runsPerStory ?? 3}`); return n; };
/** Where a frozen project lives in the hub, e.g. backend → projects/backend. */
function projectDir(key) {
  const p = hub.projects?.[key]?.path;
  if (!p) fail(`storyrail.config.json has no projects.${key}.path`);
  return join(ROOT, p);
}
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const status = (...a) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'storyrail-status.mjs'), ...a], { stdio: 'inherit' });
const state = () => readJson(STATE, null);
const current = () => {
  const s = state();
  if (!s?.exam) fail('no exam in progress: start one with `start --reason …`');
  return [s, readJson(join(RESULTS, `${s.exam}.json`), null) ?? fail(`evals/results/${s.exam}.json is missing`)];
};
const branchName = (exam, st, run) => `eval/${exam}/${st.id}-r${run}`;
const allExams = () => (existsSync(RESULTS) ? readdirSync(RESULTS).filter((f) => f.endsWith('.json')).map((f) => readJson(join(RESULTS, f), null)).filter(Boolean) : [])
  .sort((a, b) => a.id.localeCompare(b.id));

/** Puts every project of a story on a local branch at its frozen commit. Refuses to touch uncommitted work. */
function freeze(st, branch, home = {}) {
  for (const [key, sha] of Object.entries(st.freeze ?? {})) {
    const dir = projectDir(key);
    if (!existsSync(join(dir, '.git'))) fail(`${key}: ${dir} is not cloned (node scripts/storyrail-workspace.mjs sync)`, 1);
    if (git(dir, 'status', '--porcelain')) fail(`${key} has uncommitted changes; commit or discard them first`, 1);
    const was = git(dir, 'branch', '--show-current');
    if (!home[key] && was && !was.startsWith('eval/')) home[key] = was; // where to go back to after the exam
    try { git(dir, 'cat-file', '-e', `${sha}^{commit}`); } catch { git(dir, 'fetch', '--quiet', 'origin'); }
    git(dir, 'switch', '--quiet', '-C', branch, sha);
    console.log(`  ${key}: ${branch} at ${sha.slice(0, 7)}`);
  }
}

async function up(url) {
  try { const r = await fetch(url); return r.status < 500; } catch { return false; }
}
/** Starts the services a hidden suite needs; returns a stop function. */
async function startServices(names) {
  const started = [];
  for (const name of names) {
    const s = cfg.services?.[name] ?? fail(`evals.json has no services.${name}`);
    if (await up(s.url)) fail(`${s.url} already answers: stop whatever runs there, so the grade uses the run's own code`, 1);
    const child = spawn(s.start, { cwd: resolve(ROOT, s.cwd ?? '.'), shell: true, detached: true, stdio: 'ignore', env: { ...process.env, ...(s.env ?? {}) } });
    started.push(child);
    const until = Date.now() + (s.timeoutSec ?? 180) * 1000;
    process.stdout.write(`  starting ${name} `);
    while (!(await up(s.url))) {
      if (Date.now() > until || child.exitCode !== null) { stop(started); console.log('✗'); return [false, () => {}]; }
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(' up');
  }
  return [true, () => stop(started)];
}
function stop(children) {
  for (const c of children) { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* already gone */ } }
}

/** Passed and counted test cases of a JUnit XML file (Node test runner, Playwright, Surefire). */
function junit(file) {
  if (!existsSync(file)) return { passed: 0, count: 0 };
  const xml = readFileSync(file, 'utf8');
  const cases = xml.split(/<testcase\b/).slice(1).map((c) => c.split(/<\/testcase>|\/>\s*(?=<testcase|<\/testsuite)/)[0]);
  const bad = cases.filter((c) => /<(failure|error|skipped)\b/.test(c)).length;
  return { passed: cases.length - bad, count: cases.length };
}

/** Runs a story's hidden suites against what is in the projects now. */
async function runHidden(st, label) {
  const out = join(ROOT, '.storyrail', 'eval', label);
  mkdirSync(out, { recursive: true });
  const needs = [...new Set(st.hidden.flatMap((h) => h.needs ?? []))];
  const [ok, stopAll] = await startServices(needs);
  let passed = 0, count = 0;
  const details = [];
  try {
    if (!ok) { console.log('  a service did not start: every hidden test counts as failed'); return { passed: 0, count: 0, details: ['services did not start'] }; }
    for (const h of st.hidden) {
      const file = join(out, `${h.name}.xml`);
      rmSync(file, { force: true });
      const copied = h.copy ? resolve(ROOT, h.copy.to) : null;
      if (copied) { mkdirSync(dirname(copied), { recursive: true }); copyFileSync(join(HIDDEN, h.copy.from), copied); }
      const env = { ...process.env, JUNIT_FILE: file, HIDDEN };
      for (const [k, v] of Object.entries(h.env ?? {})) env[k] = String(v).replace('$JUNIT_FILE', file).replace('$HIDDEN', HIDDEN);
      process.stdout.write(`  hidden ${h.name} tests … `);
      spawnSync(h.run, { cwd: resolve(ROOT, h.cwd ?? '.'), shell: true, env, stdio: ['ignore', 'ignore', 'ignore'], timeout: 15 * 60_000 });
      if (copied) rmSync(dirname(copied), { recursive: true, force: true });
      const r = junit(file);
      console.log(`${r.passed}/${r.count}`);
      passed += r.passed; count += r.count;
      details.push(`${h.name} ${r.passed}/${r.count}`);
    }
  } finally {
    stopAll();
  }
  if (count > st.tests) console.log(`  note: ${count} hidden tests ran but evals.json says ${st.tests}; update "tests"`);
  return { passed: Math.min(passed, st.tests), count, details };
}

function printVerdict(A, B) {
  const [cls, icon, head, detail] = core.verdict(A, B, cfg);
  console.log(`\n${icon} ${head}\n  ${detail}`);
  return cls;
}

// ---------- commands ----------
switch (cmd) {
  case 'validate': {
    const problems = [];
    for (const k of ['runsPerStory', 'targets', 'stories']) if (!cfg[k]) problems.push(`evals.json: ${k} is missing`);
    for (const st of cfg.stories ?? []) {
      if (!st.file || !existsSync(join(ROOT, st.file))) problems.push(`${st.id}: story file ${st.file} not found`);
      if (!st.tests) problems.push(`${st.id}: "tests" (number of hidden tests) is missing`);
      if (!Object.keys(st.freeze ?? {}).length) problems.push(`${st.id}: "freeze" has no frozen commits`);
      for (const [k, sha] of Object.entries(st.freeze ?? {})) {
        if (String(sha).startsWith('TODO')) problems.push(`${st.id}: freeze.${k} is still a TODO`);
        else if (!/^[0-9a-f]{7,40}$/.test(sha)) problems.push(`${st.id}: freeze.${k} is not a commit id`);
      }
      for (const h of st.hidden ?? []) {
        for (const n of h.needs ?? []) if (!cfg.services?.[n]) problems.push(`${st.id}/${h.name}: needs unknown service ${n}`);
        if (h.copy && !existsSync(join(HIDDEN, h.copy.from))) problems.push(`${st.id}/${h.name}: hidden file ${h.copy.from} not found`);
        for (const m of h.run.matchAll(/\$HIDDEN\/([^"\s]+)/g)) if (!existsSync(join(HIDDEN, m[1]))) problems.push(`${st.id}/${h.name}: hidden file ${m[1]} not found`);
      }
    }
    if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
    console.log(`ok: ${cfg.stories.length} practice stories, ${cfg.stories.reduce((a, s) => a + s.tests, 0)} hidden tests, ${cfg.runsPerStory} runs each`);
    break;
  }
  case 'start': {
    const reason = flags.reason;
    if (!['baseline', 'tool', 'change'].includes(reason)) fail('--reason baseline | tool | change');
    if (state()?.exam) fail(`exam ${state().exam} is still in progress: finish it first`);
    const exams = allExams();
    if (!exams.length && reason !== 'baseline') fail('there is no exam yet, so the first one is the baseline: --reason baseline');
    const now = new Date();
    const base = now.toISOString().slice(0, 16).replace('T', '-').replace(':', ''); // e.g. 2026-11-04-0930 (UTC)
    let id = base;
    for (let n = 2; existsSync(join(RESULTS, `${id}.json`)); n++) id = `${base}-${n}`;
    const label = flags.label && flags.label !== true ? flags.label : { baseline: 'Baseline', tool: `${cfg.setup?.tool ?? 'Tool'} update`, change: 'Change' }[reason];
    const exam = { id, date: now.toISOString(), reason, label, detail: flags.detail && flags.detail !== true ? flags.detail : '', setup: cfg.setup?.name ?? '',
      runsPerStory: cfg.runsPerStory, stories: Object.fromEntries(cfg.stories.map((s) => [s.id, { title: s.title, tests: s.tests, runs: [] }])) };
    writeJson(join(RESULTS, `${id}.json`), exam);
    writeJson(STATE, { exam: id });
    console.log(`Exam ${id} (${label}) started: ${cfg.stories.length} practice stories × ${cfg.runsPerStory} runs. Results: evals/results/${id}.json`);
    break;
  }
  case 'prepare': {
    const [s, exam] = current();
    const st = story(pos[0]);
    const run = runNo(pos[1]);
    const branch = branchName(exam.id, st, run);
    console.log(`${st.id} run ${run}: frozen code`);
    s.home ??= {};
    freeze(st, branch, s.home);
    const runDir = join(ROOT, 'runs', `eval-${exam.id}-${st.id}-r${run}`);
    mkdirSync(runDir, { recursive: true });
    copyFileSync(join(ROOT, st.file), join(runDir, 'story.md'));
    s.current = { story: st.id, run, branch, startedAt: new Date().toISOString() };
    writeJson(STATE, s);
    const of = cfg.stories.length * (cfg.runsPerStory ?? 3);
    const nth = cfg.stories.findIndex((x) => x.id === st.id) * (cfg.runsPerStory ?? 3) + run;
    status('start', st.id, `EVAL · ${st.id} ${st.title}`);
    status('eval', exam.id, st.id, String(run), String(cfg.runsPerStory ?? 3), String(nth), String(of), exam.label);
    console.log(`Run folder: runs/eval-${exam.id}-${st.id}-r${run}/ (the story is story.md there). Lanes: ${st.lanes.join(', ')}. Branch in each project: ${branch}`);
    break;
  }
  case 'grade': {
    const [s, exam] = current();
    const st = story(pos[0]);
    const run = runNo(pos[1]);
    const major = num('major'), rounds = num('rounds'), human = num('human');
    if (s.current?.story !== st.id || s.current?.run !== run) console.log(`note: the prepared run was ${s.current?.story ?? 'none'} run ${s.current?.run ?? '-'}`);
    console.log(`Grading ${st.id} run ${run} with its hidden tests`);
    const r = await runHidden(st, `${exam.id}/${st.id}-r${run}`);
    const minutes = s.current?.startedAt ? Math.round((Date.now() - Date.parse(s.current.startedAt)) / 60000) : 0;
    const entry = { run, passed: r.passed, major, rounds, human, minutes, branch: s.current?.branch, hidden: r.details };
    const runs = exam.stories[st.id].runs.filter((x) => x.run !== run).concat(entry).sort((a, b) => a.run - b.run);
    exam.stories[st.id].runs = runs;
    writeJson(join(RESULTS, `${exam.id}.json`), exam);
    status('log', 'orchestrator', r.passed === st.tests ? 'ok' : 'warn', `Exam ${st.id} run ${run}: ${r.passed}/${st.tests} hidden tests passed`);
    console.log(`${st.id} run ${run}: ${r.passed}/${st.tests} hidden tests · ${major} major · ${rounds} fix rounds · ${human} human · ${minutes} min`);
    break;
  }
  case 'finish': {
    const [s, exam] = current();
    const missing = cfg.stories.flatMap((st) => Array.from({ length: cfg.runsPerStory }, (_, i) => i + 1).filter((n) => !exam.stories[st.id]?.runs.some((r) => r.run === n)).map((n) => `${st.id} run ${n}`));
    if (missing.length && !flags.partial) fail(`not graded yet: ${missing.join(', ')} (add --partial to finish anyway)`, 1);
    exam.finishedAt = new Date().toISOString();
    if (missing.length) exam.partial = missing;
    const prev = exam.reason === 'baseline' ? null : core.previous(allExams().filter((e) => e.finishedAt || e.id === exam.id), exam);
    const [cls, , head] = core.verdict(exam, prev, cfg);
    exam.verdict = { result: cls, headline: head, comparedWith: prev?.id ?? 'targets' };
    writeJson(join(RESULTS, `${exam.id}.json`), exam);
    printVerdict(exam, prev);
    // put the projects back on main and drop the local exam branches
    for (const key of new Set(cfg.stories.flatMap((st) => Object.keys(st.freeze ?? {})))) {
      const dir = projectDir(key);
      if (!existsSync(join(dir, '.git'))) continue;
      try {
        if (!git(dir, 'branch', '--show-current').startsWith(`eval/${exam.id}/`)) continue; // never touch other work
        git(dir, 'reset', '--quiet', '--hard'); // leftovers of the last exam run only
        git(dir, 'clean', '-fdq');
        git(dir, 'switch', '--quiet', s.home?.[key] ?? hub.projects?.[key]?.defaultBranch ?? 'main');
        for (const b of git(dir, 'branch', '--list', `eval/${exam.id}/*`, '--format=%(refname:short)').split('\n').filter(Boolean)) git(dir, 'branch', '-D', '--quiet', b);
      } catch (e) { console.log(`  ${key}: could not switch back (${e.message.split('\n')[0]})`); }
    }
    rmSync(STATE, { force: true });
    status('eval', 'off');
    status('end');
    console.log(`\nSaved: evals/results/${exam.id}.json. Commit it with the run folders (runs/eval-${exam.id}-*).`);
    break;
  }
  case 'report': {
    const exams = allExams().filter((e) => e.finishedAt);
    if (!exams.length) fail('no finished exam yet', 1);
    const A = pos[0] ? exams.find((e) => e.id === pos[0]) ?? fail(`unknown exam ${pos[0]}`) : exams[exams.length - 1];
    const B = flags.vs ? exams.find((e) => e.id === flags.vs) ?? fail(`unknown exam ${flags.vs}`) : A.reason === 'baseline' ? null : core.previous(exams, A);
    const a = core.stats(A);
    console.log(`Exam ${A.id} · ${A.label}${A.detail ? ` · ${A.detail}` : ''}\n  hidden tests ${a.passed}/${a.total} (${a.pct.toFixed(0)}%) · spread ${a.spread.toFixed(0)} pts · major ${a.major.toFixed(1)}/run · fix rounds ${a.rounds.toFixed(1)}/run · human ${a.human} · ${a.mins.toFixed(0)} min/run`);
    if (B) console.log(`compared with ${B.id} · ${B.label}`); else console.log('compared with your targets');
    process.exit(printVerdict(A, B) === 'worse' ? 1 : 0);
    break;
  }
  case 'list': {
    const exams = allExams();
    if (!exams.length) console.log('No exams yet. The first one is the baseline: /storyrail eval baseline');
    for (const e of exams) {
      const a = core.stats(e);
      console.log(`${e.id}  ${e.label.padEnd(18)} ${a.runs ? `${a.pct.toFixed(0)}%`.padStart(4) : '   -'}  ${e.verdict ? e.verdict.headline : e.finishedAt ? '' : '(in progress)'}`);
    }
    break;
  }
  case 'check': {
    const st = story(pos[0]);
    if (state()?.exam) fail('an exam is in progress: finish it first');
    console.log(`${st.id}: hidden tests against the frozen code (before the story). Most should fail; a test that passes here doesn't test the story.`);
    const prevBranches = Object.keys(st.freeze).map((k) => [k, git(projectDir(k), 'branch', '--show-current')]);
    freeze(st, `eval/check/${st.id}`);
    try {
      const r = await runHidden(st, `check/${st.id}`);
      console.log(`${r.passed}/${st.tests} pass on the frozen code${r.passed > st.tests / 4 ? ': too many, the answer key needs work' : ': good'}`);
    } finally {
      for (const [k, b] of prevBranches) { const d = projectDir(k); git(d, 'switch', '--quiet', b || 'main'); git(d, 'branch', '-D', '--quiet', `eval/check/${st.id}`); }
    }
    break;
  }
  default:
    fail('commands: validate, start, prepare, grade, finish, report, list, check (see the top of this file)');
}
