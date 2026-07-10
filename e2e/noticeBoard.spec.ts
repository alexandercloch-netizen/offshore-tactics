import { test, expect } from '@playwright/test';

// The Notice Board (in-app feedback) on the guest path: no Supabase env in CI,
// so submitting exercises the local-queue branch — the note is "saved on board"
// and the inline success state swaps in. Independent of the engine; touches no
// simulation surface.

test('a guest can log a note to the Race Committee from the harbour', async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  page.on('dialog', (d) => {
    throw new Error(`Unexpected native dialog: ${d.message()}`);
  });

  await page.goto('/');

  // First-run onboarding → the personalised harbour.
  await page.getByText('UK & Ireland', { exact: true }).first().click();
  await page.getByText('Win, obviously', { exact: true }).first().click();
  await page.getByText('Weekend warrior', { exact: true }).first().click();

  // The harbour header carries the Notice Board pennant.
  await page.getByTestId('feedback-entry-home').click();
  await expect(page.getByTestId('notice-board')).toBeVisible();

  // Pick a category, write a note, send it.
  await page.getByTestId('feedback-cat-bug').click();
  await page.getByTestId('feedback-message').fill('The wind indicator froze after a tack.');
  await page.getByTestId('feedback-submit').click();

  // Inline success swap — no Supabase in CI, so it lands in the on-board queue.
  await expect(page.getByTestId('feedback-success')).toBeVisible();
  await expect(page.getByText("Saved on board", { exact: false })).toBeVisible();

  // "Send another" returns to the form.
  await page.getByTestId('feedback-send-another').click();
  await expect(page.getByTestId('feedback-message')).toBeVisible();
});
