#!/usr/bin/env node
// Build the stand-alone StoryRail demo page: docs/demo/index.html.
//
// One HTML file, no server and no account needed: it replays a sample run of story #51 on a loop
// (Orchestration, Squad and Flow tabs) and shows an Evals tab with sample exam data. Squad members
// answer chat questions from their status and log in the replay.
//
// Open it by double-clicking the file, through the local dashboard at http://localhost:4800/demo,
// or host the docs/ folder on any static web server (GitLab Pages, an intranet server, GitHub Pages).
//
// Usage (from the hub root):  node scripts/storyrail-build-demo.mjs
// Inputs: storyrail-dashboard/index.html, storyrail.config.json, storyrail-dashboard/demo-src/*

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'storyrail-dashboard', 'demo-src');
const OUT = join(ROOT, 'docs', 'demo', 'index.html');

const read = (...parts) => readFileSync(join(...parts), 'utf8');
const fail = (msg) => {
  console.error(`storyrail-build-demo: ${msg}`);
  process.exit(2);
};

let html = read(ROOT, 'storyrail-dashboard', 'index.html');
const squad = JSON.parse(read(ROOT, 'storyrail.config.json')).squad.members;

// Plain-text replace (no regex, no `$` patterns), exactly once.
function rep(from, to) {
  const i = html.indexOf(from);
  if (i < 0) fail(`the dashboard changed, can't find: ${from.slice(0, 90)}`);
  html = html.slice(0, i) + to + html.slice(i + from.length);
}
// Replace everything from `start` up to (not including) `end`.
function cut(start, end, insert) {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  if (i < 0 || j < 0) fail(`the dashboard changed, can't find: ${(i < 0 ? start : end).slice(0, 90)}`);
  html = html.slice(0, i) + insert + html.slice(j);
}

// The squad comes from the config instead of the server.
cut('fetch("squad.json"', 'setInterval(()=>{ if(!$("view-squad").hidden) renderSquad(); },15000);',
  `const SQUAD=${JSON.stringify(squad)};
squad=SQUAD; squad.forEach(m=>m.stations.forEach(s=>byStation[s]=m)); byStation.orchestrator=squad.find(m=>m.kind==="lead");
engine="records";
`);
rep(`async function loadMember(id){
  try{ const r=await fetch("api/member?id="+encodeURIComponent(id),{cache:"no-store"}); if(r.ok) chatCache[id]=await r.json(); }catch(e){ /* server may be restarting; keep the last copy */ }
}`, 'async function loadMember(id){ chatCache[id]=chatCache[id]||{outputs:[],chat:[]}; }');
{
  const i = html.indexOf('$("d-engine").textContent=');
  const k = html.indexOf('"AI answers are off on this machine', i);
  if (i < 0 || k < 0) fail("the dashboard changed, can't find the chat engine line");
  const j = html.indexOf(';', k) + 1;
  html = `${html.slice(0, i)}$("d-engine").textContent="Demo: "+m.name+" answers from their status and log in this replay.";${html.slice(j)}`;
}

// Chat: answers come from the member's records in the replay.
cut('$("d-form").addEventListener("submit",async e=>{', '$("d-q").addEventListener("keydown"', `${read(SRC, 'notes.js')}\n${read(SRC, 'chat.js')}`);

// The replay instead of polling the local server.
cut('(()=>{\n  const conn=$("conn"); let last="", fails=0;', '})();\n</script>', `${read(SRC, 'replay.js')}\n`);
rep('<p class="foot">Live: agents report through <code>scripts/storyrail-status.mjs</code>; this page refreshes every 1.5 s.</p>',
  '<p class="foot">Demo replay of a sample run, on a loop. In a real run the agents report through <code>scripts/storyrail-status.mjs</code> and the local dashboard updates every 1.5 s.</p>');
rep('<span class="chip" id="conn">connecting</span>',
  '<span class="chip live" id="conn">demo replay</span><button class="chip replay" id="replay" type="button">Restart</button>');
rep('.chip b{color:var(--on-brand);font-weight:600}',
  '.chip b{color:var(--on-brand);font-weight:600}\n.chip.replay{background:transparent;cursor:pointer}\n.chip.replay:hover{border-color:var(--on-brand)}\n.chip.replay:focus-visible{outline:3px solid #fff;outline-offset:2px}');

// Evals tab: the shared exam logic inline, with sample exams instead of evals/results/.
rep('<script src="evals-core.js"></script>', `<script>\n${read(join(ROOT, 'storyrail-dashboard'), 'evals-core.js')}</script>\n<script>\n${read(SRC, 'evals-sample.js')}</script>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`Built ${relative(ROOT, OUT)} (${Math.round(html.length / 1024)} KB). Open it in a browser, or http://localhost:4800/demo`);
