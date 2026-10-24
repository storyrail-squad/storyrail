// Hidden tests for practice story E2 (Sort the book list). Black-box against the running backend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { call, newBook, cleanup, titleTag } from '../lib.mjs';

after(cleanup);

// Five books that only these tests use; `q=<tag>` limits every list to them.
const B = [
  { title: 'delta', author: 'Echo', publishedYear: 1999 },
  { title: 'Alpha', author: 'charlie', publishedYear: 2015 },
  { title: 'charlie', author: 'Alpha', publishedYear: 1987 },
  { title: 'Bravo', author: 'delta', publishedYear: 2015 },
  { title: 'echo', author: 'bravo', publishedYear: 2003 },
];
before(async () => { for (const b of B) await newBook(b); });

const list = async (qs) => {
  const r = await call('GET', `/api/books?q=${encodeURIComponent(titleTag)}${qs}`);
  return r;
};
const titles = (r) => r.json.items.map((b) => b.title.slice(titleTag.length + 1));

test('E2 BE-AC2: without sort the list is title A–Z, case-insensitive (unchanged)', async () => {
  assert.deepEqual(titles(await list('')), ['Alpha', 'Bravo', 'charlie', 'delta', 'echo']);
});

test('E2 BE-AC1: sort=title,desc', async () => {
  assert.deepEqual(titles(await list('&sort=title,desc')), ['echo', 'delta', 'charlie', 'Bravo', 'Alpha']);
});

test('E2 BE-AC1: sort=author (asc by default), case-insensitive', async () => {
  const r = await list('&sort=author');
  assert.deepEqual(r.json.items.map((b) => b.author), ['Alpha', 'bravo', 'charlie', 'delta', 'Echo']);
});

test('E2 BE-AC1: sort=publishedYear,desc', async () => {
  const years = (await list('&sort=publishedYear,desc')).json.items.map((b) => b.publishedYear);
  assert.deepEqual(years, [2015, 2015, 2003, 1999, 1987]);
});

test('E2 BE-AC1: sort=createdAt,desc puts the newest book first', async () => {
  assert.deepEqual(titles(await list('&sort=createdAt,desc'))[0], 'echo');
  assert.deepEqual(titles(await list('&sort=createdAt'))[0], 'delta');
});

test('E2 BE-AC2/AC3: ties are stable across pages, and paging never repeats or skips a book', async () => {
  const seen = [];
  for (let p = 0; p < 5; p += 1) {
    const r = await list(`&sort=publishedYear,desc&size=1&page=${p}`);
    assert.equal(r.status, 200);
    seen.push(...titles(r));
  }
  assert.equal(new Set(seen).size, 5, `got ${seen.join(', ')}`);
  const again = [];
  for (let p = 0; p < 2; p += 1) again.push(...titles(await list(`&sort=publishedYear,desc&size=1&page=${p}`)));
  assert.deepEqual(again, seen.slice(0, 2), 'the same order on a second read');
});

test('E2 BE-AC3: sort combines with genre and available', async () => {
  const r = await list('&sort=title,desc&genre=FICTION&available=true');
  assert.equal(r.status, 200);
  assert.deepEqual(titles(r), ['echo', 'delta', 'charlie', 'Bravo', 'Alpha']);
  const none = await list('&sort=title&genre=SCIENCE');
  assert.equal(none.json.items.length, 0);
});

for (const bad of ['isbn', 'title,up', '', 'publishedYear,desc,asc']) {
  test(`E2 BE-AC4: sort=${bad || '(empty)'} is 400 with errors.sort`, async () => {
    const r = await list(`&sort=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 400);
    assert.equal(r.json.title, 'Validation failed');
    assert.ok(r.json.errors?.sort, 'errors.sort is set');
  });
}
