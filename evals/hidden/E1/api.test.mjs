// Hidden tests for practice story E1: an EXAMPLE to adapt (TODO(office)). Black-box HTTP against the apps the grader
// started from the exam run's code (TA01_URL, FA01_URL), using only what the story and its API document state.
// Take them from the acceptance tests that came with the real story. Keep "tests" in evals.json equal to their number,
// and check with `node scripts/storyrail-eval.mjs check E1` that most of them FAIL on the frozen code.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const TA01 = process.env.TA01_URL ?? 'http://localhost:8081';
const FA01 = process.env.FA01_URL ?? 'http://localhost:8082';
const get = async (base, path) => {
  const r = await fetch(base + path);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, json, type: r.headers.get('content-type') ?? '' };
};

// TODO(office): ids of test data that exists in the apps' local profile (seed data), or create it in a before() hook.
const KNOWN = 'TODO-known-id';
const WITHOUT_INFO = 'TODO-id-without-info';
const UNKNOWN = 'TODO-unknown-id';

test('E1 ta01-AC1: the task API returns the new data', async () => {
  const r = await get(TA01, `/tasks/${KNOWN}/info`);
  assert.equal(r.status, 200);
  assert.ok(r.json && typeof r.json === 'object');
});

test('E1 ta01-AC2: no data is a 404 problem with the documented title', async () => {
  const r = await get(TA01, `/tasks/${WITHOUT_INFO}/info`);
  assert.equal(r.status, 404);
  assert.match(r.type, /application\/problem\+json/);
  assert.equal(r.json.title, 'TODO(office): problem title from the API document');
});

test('E1 fa01-AC1: the facade returns the same data, mapped to its own fields', async () => {
  const r = await get(FA01, `/info/${KNOWN}`);
  assert.equal(r.status, 200);
});

test("E1 fa01-AC2: the provider's 404 becomes the facade's own 404 problem", async () => {
  const r = await get(FA01, `/info/${WITHOUT_INFO}`);
  assert.equal(r.status, 404);
  assert.match(r.type, /application\/problem\+json/);
});

test('E1 fa01-AC2: an unknown id is a 404 at the facade too', async () => {
  const r = await get(FA01, `/info/${UNKNOWN}`);
  assert.equal(r.status, 404);
});
