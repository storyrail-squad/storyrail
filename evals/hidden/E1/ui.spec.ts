// Hidden tests for practice story E1 (Loan history), frontend part.
// Runs in the frontend's UI automation in integration mode (E2E_REAL_API = the backend the grader started), so the
// screen is checked against the real API. Only roles, names and texts from the story are used: no test ids.
import { randomInt } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rawApi = process.env.E2E_REAL_API ?? 'http://localhost:8080';
const API = rawApi.endsWith('/') ? rawApi.slice(0, -1) : rawApi;
const tag = `eval-ui-${Date.now().toString(36)}`;
const ids: string[] = [];

function isbn13(): string {
  const d = '978' + String(randomInt(1e9)).padStart(9, '0');
  const sum = Array.from(d, Number).reduce((s, c, i) => s + c * (i % 2 ? 3 : 1), 0);
  return d + String((10 - (sum % 10)) % 10);
}
async function newBook(request: APIRequestContext, name: string): Promise<{ id: string; title: string }> {
  const r = await request.post(`${API}/api/books`, {
    data: { title: `${tag} ${name}`, author: 'Eval Author', isbn: isbn13(), publishedYear: 2001, genre: 'FICTION' },
  });
  expect(r.status()).toBe(201);
  const b = (await r.json()) as { id: string; title: string };
  ids.push(b.id);
  return b;
}
const setAvailable = (request: APIRequestContext, id: string, available: boolean) =>
  request.patch(`${API}/api/books/${id}/availability`, { data: { available } });

async function openHistory(page: Page, title: string) {
  await page.goto('./');
  await page.getByLabel('Search').fill(title);
  const button = page.getByRole('button', { name: `Show loan history of ${title}` });
  await button.click();
  const dialog = page.getByRole('dialog', { name: `Loan history of ${title}` });
  await expect(dialog).toBeVisible();
  return { button, dialog };
}

test.afterAll(async ({ request }) => {
  for (const id of ids) await request.delete(`${API}/api/books/${id}`);
});

test('E1 FE-AC1: the dialog lists each loan, newest first, open loan as Not returned yet', async ({ page, request }) => {
  const b = await newBook(request, 'Borrowed twice');
  await setAvailable(request, b.id, false);
  await setAvailable(request, b.id, true);
  await setAvailable(request, b.id, false);
  const { dialog } = await openHistory(page, b.title);
  const items = dialog.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Not returned yet');
  await expect(items.nth(1)).not.toContainText('Not returned yet');
});

test('E1 FE-AC2: a book without loans shows Never borrowed', async ({ page, request }) => {
  const b = await newBook(request, 'Never lent');
  const { dialog } = await openHistory(page, b.title);
  await expect(dialog.getByText('Never borrowed')).toBeVisible();
});

test('E1 FE-AC3: a failing request shows the error and Try again', async ({ page, request }) => {
  const b = await newBook(request, 'Flaky');
  let fail = true;
  await page.route(/\/api\/books\/[^/]+\/loans/, async (route) => {
    if (fail) await route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{"title":"Internal error","status":500}' });
    else await route.continue();
  });
  const { dialog } = await openHistory(page, b.title);
  await expect(dialog.getByText("Couldn't load the loan history")).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByText('Never borrowed')).toBeVisible();
});

test('E1 FE-AC4: Close and Escape close the dialog and focus returns to the button', async ({ page, request }) => {
  const b = await newBook(request, 'Focus');
  const first = await openHistory(page, b.title);
  await first.dialog.getByRole('button', { name: 'Close' }).click();
  await expect(first.dialog).toBeHidden();
  await expect(first.button).toBeFocused();
  await first.button.click();
  await expect(first.dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first.dialog).toBeHidden();
  await expect(first.button).toBeFocused();
});
