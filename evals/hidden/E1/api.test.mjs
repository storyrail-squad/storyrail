// Hidden tests for practice story E1 (Loan history), backend part. Black-box against the running backend.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { call, newBook, cleanup, sleep } from '../lib.mjs';

after(cleanup);

const loans = (id, q = '') => call('GET', `/api/books/${id}/loans${q}`);
const lend = (id) => call('PATCH', `/api/books/${id}/availability`, { available: false });
const giveBack = (id) => call('PATCH', `/api/books/${id}/availability`, { available: true });

test('E1 BE-AC3: a book that was never borrowed has an empty history', async () => {
  const b = await newBook();
  const r = await loans(b.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items, []);
  assert.equal(r.json.totalItems, 0);
});

test('E1 BE-AC1/AC2: lending starts a loan, returning ends it', async () => {
  const b = await newBook();
  assert.equal((await lend(b.id)).status, 200);
  let r = await loans(b.id);
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);
  assert.ok(!Number.isNaN(Date.parse(r.json.items[0].borrowedAt)), 'borrowedAt is a date-time');
  assert.equal(r.json.items[0].returnedAt, null);
  assert.equal((await giveBack(b.id)).status, 200);
  r = await loans(b.id);
  assert.equal(r.json.items.length, 1);
  assert.ok(Date.parse(r.json.items[0].returnedAt) >= Date.parse(r.json.items[0].borrowedAt), 'returnedAt after borrowedAt');
});

test('E1 BE-AC1: newest loan first, with page fields', async () => {
  const b = await newBook();
  await lend(b.id); await giveBack(b.id);
  await sleep(20);
  await lend(b.id);
  const r = await loans(b.id);
  assert.equal(r.json.items.length, 2);
  assert.equal(r.json.items[0].returnedAt, null, 'the open loan is first');
  assert.ok(Date.parse(r.json.items[0].borrowedAt) >= Date.parse(r.json.items[1].borrowedAt));
  for (const k of ['page', 'size', 'totalItems', 'totalPages']) assert.equal(typeof r.json[k], 'number', k);
  assert.equal(r.json.size, 20);
  assert.equal(r.json.totalItems, 2);
});

test('E1 BE-AC1: page and size work and are validated', async () => {
  const b = await newBook();
  for (let i = 0; i < 3; i += 1) { await lend(b.id); await giveBack(b.id); }
  const r = await loans(b.id, '?page=1&size=2');
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.totalPages, 2);
  const bad = await loans(b.id, '?size=0');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.title, 'Validation failed');
  assert.ok(bad.json.errors?.size, 'errors.size is set');
});

test('E1 BE-AC2: sending the value a book already has changes nothing', async () => {
  const b = await newBook();
  await giveBack(b.id); // already available
  assert.equal((await loans(b.id)).json.items.length, 0);
  await lend(b.id); await lend(b.id); // already on loan the second time
  assert.equal((await loans(b.id)).json.items.length, 1);
});

test('E1 BE-AC3: an unknown book is 404 Book not found', async () => {
  const r = await loans('00000000-0000-0000-0000-000000000000');
  assert.equal(r.status, 404);
  assert.match(r.type, /application\/problem\+json/);
  assert.equal(r.json.title, 'Book not found');
});

test('E1 BE-AC4: deleting a book deletes its loans', async () => {
  const b = await newBook();
  await lend(b.id);
  assert.equal((await call('DELETE', `/api/books/${b.id}`)).status, 204);
  assert.equal((await loans(b.id)).status, 404);
});
