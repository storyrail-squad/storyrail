#!/usr/bin/env node
// Serves the StoryRail dashboard locally: http://localhost:4800
// The page polls /status.json, which agents update through scripts/storyrail-status.mjs.
// It also serves the squad roster, each member's run reports, and "ask a member" chat.
//
// Usage: node scripts/storyrail-dashboard.mjs [port]
//
// Chat answers (STORYRAIL_ASK, default "auto"):
//   bob      IBM Bob Shell, read-only:  bob run --mode ask   (needs BOB_API_KEY)
//   records  no AI: answers from the member's status, log and reports
//   auto     bob if installed and BOB_API_KEY is set, else records

import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? process.env.STORYRAIL_PORT ?? 4800);
const STATE_DIR = join(ROOT, '.storyrail');
const CHAT_DIR = join(STATE_DIR, 'chats');
const RUNS_DIR = join(ROOT, 'runs');
const ASK_TIMEOUT_MS = 150_000;
const MAX_QUESTION = 1000;

const config = JSON.parse(readFileSync(join(ROOT, 'storyrail.config.json'), 'utf8'));
const squad = config.squad ?? { members: [], outputs: {} };
const members = new Map(squad.members.map((m) => [m.id, m]));

// ---------- helpers ----------

function onPath(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function pickEngine() {
  const wanted = (process.env.STORYRAIL_ASK ?? 'auto').toLowerCase();
  if (wanted === 'bob' || wanted === 'records') return wanted;
  if (onPath('bob') && process.env.BOB_API_KEY) return 'bob';
  return 'records';
}
const ENGINE = pickEngine();

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const status = () => readJson(join(STATE_DIR, 'status.json'), {});

/** runs/issue-<first issue>, the folder of the current run. */
function runFolder(st) {
  const first = st.run?.issues?.[0];
  return first ? join('runs', `issue-${first}`) : null;
}

function globToRegex(pattern) {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
}

/** A member's stations in this run: "dev@backend" stands for the build of every backend application of the run. */
function stationsOf(member, st) {
  const apps = st.run?.apps ?? [];
  return (member.stations ?? []).flatMap((s) => {
    const p = /^(dev|tests|fix)@(frontend|backend)$/.exec(s);
    return p ? apps.filter((a) => a.type === p[2]).map((a) => `${p[1]}@${a.id}`) : [s];
  });
}

/** The report files a member wrote in this run, as paths relative to the hub root. */
function memberOutputs(member, st) {
  const folder = runFolder(st);
  if (!folder || !existsSync(join(ROOT, folder))) return [];
  const patterns = stationsOf(member, st)
    .flatMap((s) => {
      const app = s.includes('@') ? s.split('@')[1] : '';
      return (squad.outputs?.[s] ?? squad.outputs?.[s.replace(/@.*/, '@*')] ?? []).map((g) => g.replace('$APP', app));
    })
    .map(globToRegex);
  const extra = memberNotes(member, st).map((n) => n.path);
  if (!patterns.length) return extra;
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (patterns.some((p) => p.test(entry.name))) found.push(rel.split(sep).join('/'));
    }
  };
  walk(folder);
  return [...new Set([...found, ...extra])].sort();
}

/** A member's work notes and saved completion summaries in this run: [{ path, text }]. */
function memberNotes(member, st) {
  const folder = runFolder(st);
  if (!folder) return [];
  const ids = member.kind === 'lead' ? ['orchestrator'] : stationsOf(member, st);
  const found = [];
  for (const kind of ['notes', 'summaries']) {
    for (const id of ids) {
      const rel = `${folder}/${kind}/${id}.md`.split(sep).join('/');
      try {
        found.push({ kind, path: rel, text: readFileSync(join(ROOT, rel), 'utf8') });
      } catch {
        // not written (yet)
      }
    }
  }
  return found;
}

/** Every instruction file of a member's agent: its brief plus the rules that apply to it. */
function briefPaths(member) {
  if (!member.brief) return [];
  const dir = member.brief === 'orchestrator' ? 'rules-sr-orchestrator' : `rules-${member.brief}`;
  const list = (d) => (existsSync(join(ROOT, '.bob', d)) ? readdirSync(join(ROOT, '.bob', d)).filter((f) => f.endsWith('.md')).sort().map((f) => `.bob/${d}/${f}`) : []);
  return [...list('rules'), ...list(dir)];
}

function briefPath(member) {
  if (!member.brief) return null;
  const candidates =
    member.brief === 'orchestrator'
      ? ['.bob/rules-sr-orchestrator/01-orchestrator.md']
      : [`.bob/rules-${member.brief}/01-brief.md`];
  return candidates.find((c) => existsSync(join(ROOT, c))) ?? null;
}

function memberFeed(member, st) {
  const ids = new Set(stationsOf(member, st));
  if (member.kind === 'lead') ids.add('orchestrator');
  return (st.feed ?? []).filter((f) => ids.has(f.agent));
}

const chatFile = (id) => join(CHAT_DIR, `${id}.json`);
const loadChat = (id) => readJson(chatFile(id), []);
function saveChat(id, chat) {
  mkdirSync(CHAT_DIR, { recursive: true });
  writeFileSync(chatFile(id), JSON.stringify(chat.slice(-60), null, 2));
}

// ---------- answering ----------

function describeStatus(member, st) {
  return stationsOf(member, st)
    .map((s) => {
      const a = st.agents?.[s] ?? { status: 'pending' };
      return `${s}: ${a.status}${a.progress ? ` ${a.progress}%` : ''}${a.note ? ` – ${a.note}` : ''}`;
    })
    .join('; ');
}

function buildPrompt(member, question, st) {
  const outputs = memberOutputs(member, st);
  const main = outputs.find((o) => o.endsWith('.md'));
  let excerpt = '';
  if (main) {
    try {
      excerpt = readFileSync(join(ROOT, main), 'utf8').slice(0, 4000);
    } catch {
      excerpt = '';
    }
  }
  const feed = memberFeed(member, st).slice(-15).map((f) => `- ${f.t} [${f.level}] ${f.msg}`).join('\n') || '- (nothing yet)';
  const history = loadChat(member.id).slice(-6).map((c) => `${c.from === 'you' ? 'Product owner' : member.name}: ${c.text}`).join('\n');
  const briefs = briefPaths(member);
  const notes = memberNotes(member, st)
    .map((n) => `${n.kind === 'notes' ? 'Your work notes' : 'Your completion summary to the orchestrator'} (${n.path}):\n"""\n${n.text.slice(0, 3500)}\n"""`)
    .join('\n');
  return [
    `You are ${member.name}, the ${member.role} in the StoryRail delivery squad. ${member.about}`,
    briefs.length ? `Your working instructions are in ${briefs.join(', ')} (read them if the question is about how you work).` : '',
    'The product owner is asking you a question on the squad dashboard. Answer in first person, as yourself, in plain',
    'language and at most 120 words. Base the answer only on the records below and the files of this run; if they do not',
    'cover it, say so and name who in the squad would know. Do not change any file.',
    '',
    `Run: ${st.run?.title ?? 'no run in progress'} · issues ${(st.run?.issues ?? []).join(', ') || '–'} · phase ${st.run?.phase ?? '–'}`,
    `Run folder: ${runFolder(st) ?? '–'}`,
    `Your status: ${member.kind === 'lead' ? 'you coordinate the whole run' : stationsOf(member, st).length ? describeStatus(member, st) : 'nothing for you in this run (no application of your kind)'}`,
    st.run?.apps?.length ? `Applications of the run, providers first: ${st.run.apps.map((a) => `${a.id} (${a.type}${a.consumes?.length ? `, calls ${a.consumes.join(', ')}` : ''})`).join(', ')}` : '',
    `Your recent activity (oldest first):\n${feed}`,
    `Your outputs: ${outputs.join(', ') || 'none yet'}`,
    notes,
    excerpt ? `Start of ${main}:\n"""\n${excerpt}\n"""` : '',
    history ? `Earlier in this chat:\n${history}` : '',
    '',
    `Question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const STATION_LABEL = { 'req-fetch': 'requirement analysis', reviewer: 'review', gate: 'quality scans', cicd: 'merge and CI' };
function stationLabel(s) {
  const m = /^(dev|tests|fix)@(.+)$/.exec(s);
  if (m) return `${{ dev: 'build', tests: 'tests', fix: 'fixes' }[m[1]]} of ${m[2]}`;
  return STATION_LABEL[s] ?? s;
}
const STATUS_WORDS = { pending: 'not started yet', running: 'in progress', done: 'done', failed: 'failed', waiting: 'waiting for you', skipped: 'not needed this run' };

function recordsAnswer(member, st) {
  const lines = [];
  if (member.kind === 'lead') {
    lines.push(st.run?.startedAt ? `We're in the ${st.run.phase ?? 'first'} phase of “${st.run.title ?? 'this story'}”.` : 'No story is running right now.');
  }
  for (const s of stationsOf(member, st)) {
    const a = st.agents?.[s] ?? { status: 'pending' };
    const pct = a.status === 'running' && a.progress ? ` (${a.progress}%)` : '';
    lines.push(`My ${stationLabel(s)} is ${STATUS_WORDS[a.status] ?? a.status}${pct}${a.note ? `: ${a.note}` : '.'}`);
  }
  const feed = memberFeed(member, st).slice(-3);
  if (feed.length) lines.push(`What I've reported lately:\n${feed.map((f) => `• ${f.msg}`).join('\n')}`);
  const myNotes = memberNotes(member, st).find((n) => n.kind === 'notes');
  if (myNotes) {
    const bullets = myNotes.text.split('\n').filter((l) => /^\s*[-*•]/.test(l)).slice(0, 6).map((l) => `• ${l.replace(/^\s*[-*•]\s*/, '')}`);
    if (bullets.length) lines.push(`From my work notes:\n${bullets.join('\n')}`);
  }
  const outputs = memberOutputs(member, st);
  if (outputs.length) lines.push(`My reports so far: ${outputs.map((o) => o.split('/').slice(-2).join('/')).join(', ')}. They're linked at the top of this panel.`);
  lines.push('I can only answer from my records right now: AI answers are not switched on for this dashboard (see SETUP.md, "Ask a squad member").');
  return lines.join('\n');
}

function run(cmd, args, input) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timed out'));
    }, ASK_TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun(out);
      else reject(new Error(`${cmd} exited with ${code}: ${err.trim().slice(-300)}`));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function aiAnswer(prompt) {
  // Ask mode is read-only; stream-json ends with a {"type":"result","last_message":…} line.
  const out = await run('bob', ['run', '--mode', 'ask', '--format', 'stream-json', '--max-turns', '8'], prompt);
  const result = out
    .split('\n')
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((o) => o && o.type === 'result')
    .pop();
  const text = result?.last_message ?? result?.result;
  return typeof text === 'string' ? text : JSON.stringify(text ?? out.trim().split('\n').pop());
}

let busy = false;
async function ask(member, question) {
  const st = status();
  const chat = loadChat(member.id);
  chat.push({ from: 'you', text: question, t: new Date().toISOString() });
  let answer;
  let engine = ENGINE;
  if (ENGINE === 'records') {
    answer = recordsAnswer(member, st);
  } else {
    try {
      answer = await aiAnswer(buildPrompt(member, question, st));
    } catch (e) {
      engine = 'records';
      answer = `${recordsAnswer(member, st)}\n(The ${ENGINE} answer failed: ${e.message})`;
    }
  }
  chat.push({ from: member.id, text: answer, t: new Date().toISOString(), engine });
  saveChat(member.id, chat);
  return chat;
}

// ---------- HTTP ----------

const TYPES = { '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10_000) reject(new Error('too large'));
    });
    req.on('end', () => resolveBody(data));
    req.on('error', reject);
  });
}

/** Only this page may call the API: same origin, JSON, custom header (blocks cross-site requests). */
function trusted(req) {
  const origin = req.headers.origin;
  const sameOrigin = !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
  return sameOrigin && req.headers['x-storyrail'] === '1';
}

/** Exam history for the Evals tab: evals/results/*.json plus what the page needs from evals/evals.json (never the hidden tests). */
function evals() {
  const cfg = readJson(join(ROOT, 'evals', 'evals.json'), null);
  if (!cfg) return { config: null, exams: [] };
  const dir = join(ROOT, 'evals', 'results');
  const exams = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f), null)).filter(Boolean) : [];
  const config = { setup: cfg.setup, runsPerStory: cfg.runsPerStory, targets: cfg.targets, compare: cfg.compare,
    stories: (cfg.stories ?? []).map(({ id, title, kind, lanes, apps, tests, why }) => ({ id, title, kind, tests, why,
      lanes: lanes ?? String(apps ?? '').split(',').map((a) => a.split('>')[0].trim()).filter(Boolean) })) };
  return { config, exams };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/') {
      return send(res, 200, await readFile(join(ROOT, 'storyrail-dashboard', 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && (path === '/demo' || path === '/demo/')) {
      // the stand-alone demo replay (build it with: node scripts/storyrail-build-demo.mjs)
      const demo = join(ROOT, 'docs', 'demo', 'index.html');
      if (!existsSync(demo)) return send(res, 404, 'No demo built yet. Run: node scripts/storyrail-build-demo.mjs', 'text/plain; charset=utf-8');
      return send(res, 200, await readFile(demo), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/status.json') {
      return send(res, 200, existsSync(join(STATE_DIR, 'status.json')) ? await readFile(join(STATE_DIR, 'status.json')) : '{}');
    }
    if (req.method === 'GET' && path === '/evals-core.js') {
      return send(res, 200, await readFile(join(ROOT, 'storyrail-dashboard', 'evals-core.js')), 'text/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/api/evals') {
      return send(res, 200, evals());
    }
    if (req.method === 'GET' && path === '/squad.json') {
      return send(res, 200, { engine: ENGINE, members: squad.members });
    }
    if (req.method === 'GET' && path === '/api/member') {
      const member = members.get(url.searchParams.get('id') ?? '');
      if (!member) return send(res, 404, { error: 'unknown member' });
      const st = status();
      return send(res, 200, { outputs: memberOutputs(member, st), chat: loadChat(member.id), brief: briefPath(member) });
    }
    if (req.method === 'POST' && path === '/api/ask') {
      if (!trusted(req)) return send(res, 403, { error: 'not allowed' });
      const { member: id, question } = JSON.parse((await readBody(req)) || '{}');
      const member = members.get(id);
      const q = String(question ?? '').trim();
      if (!member || !member.brief) return send(res, 400, { error: 'This squad member can’t be asked.' });
      if (!q || q.length > MAX_QUESTION) return send(res, 400, { error: `Ask a question of 1–${MAX_QUESTION} characters.` });
      if (busy) return send(res, 429, { error: 'Another question is being answered. Try again in a moment.' });
      busy = true;
      try {
        return send(res, 200, { chat: await ask(member, q) });
      } finally {
        busy = false;
      }
    }
    if (req.method === 'GET' && path.startsWith('/runs/')) {
      // Read-only access to run reports, never outside runs/.
      const file = normalize(join(ROOT, decodeURIComponent(path)));
      if (!file.startsWith(RUNS_DIR + sep) || !TYPES[extname(file).toLowerCase()] || !existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, await readFile(file), TYPES[extname(file).toLowerCase()]);
    }
    return send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`StoryRail dashboard already running on http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

// Bind to localhost only: the dashboard is for this machine.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`StoryRail dashboard: http://localhost:${PORT}  (squad chat answers: ${ENGINE})`);
});
