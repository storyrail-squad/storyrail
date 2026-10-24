// Helpers for the hidden exam tests: black-box HTTP against the running backend, nothing from the app's own code.
// Hidden tests are the answer key of a practice story. Agents never read this folder (see evals/README.md).
import assert from 'node:assert/strict';

export const API = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

/** A random ISBN-13 with a valid check digit (prefix 978). */
export function isbn13() {
  const d = '978' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const sum = [...d].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return d + ((10 - (sum % 10)) % 10);
}

export async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json, type: res.headers.get('content-type') ?? '' };
}

const created = new Set();
const tag = `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Creates a book whose title starts with a unique tag, so tests never collide with seed data or each other. */
export async function newBook(over = {}) {
  const input = { title: `${tag} ${over.title ?? 'Book'}`, author: over.author ?? 'Eval Author', isbn: isbn13(),
    publishedYear: over.publishedYear ?? 2001, genre: over.genre ?? 'FICTION' };
  const r = await call('POST', '/api/books', input);
  assert.equal(r.status, 201, `creating a book failed: ${JSON.stringify(r.json)}`);
  created.add(r.json.id);
  return r.json;
}
export const titleTag = tag;

export async function cleanup() {
  for (const id of created) await call('DELETE', `/api/books/${id}`);
  created.clear();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
