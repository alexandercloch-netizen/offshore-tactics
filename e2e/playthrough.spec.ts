import { test, expect, Page } from '@playwright/test';

// Drives the exported web build through a complete campaign: pick the first
// race, kit out a boat and crew, sail it (answering any tactical decisions),
// and land on the results screen.
test('a full race can be played from start to finish', async ({ page }) => {
  await page.goto('/');

  // First run: answer the onboarding quiz (role → boat → region → goal →
  // experience), which lands back on the personalised home screen.
  await page.getByText('Skipper', { exact: true }).first().click();
  await page.getByText('Cruiser-Racer', { exact: true }).first().click();
  await page.getByText('UK & Ireland', { exact: true }).first().click();
  await page.getByText('Compete', { exact: true }).first().click();
  await page.getByText('Club racer', { exact: true }).first().click();

  // Home → race select (the always-present "browse" entry).
  await page.getByRole('button', { name: 'Browse All Races' }).click();

  // Enter the first race in the Corinthian division.
  await page.getByRole('button', { name: 'Enter', exact: true }).first().click();

  // Pick the cheapest boat and continue.
  await page.getByText('Sea Sprite', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Crew' }).click();

  // Sign one crew member and continue.
  await page.getByText('Captain Mara Vega', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Provisions' }).click();

  // Set sail.
  await page.getByRole('button', { name: 'Set Sail' }).click();

  // Dismiss the first-run how-to-play overlay so the race starts.
  await page.getByRole('button', { name: /Got it/ }).click();

  // Sail to the finish, answering any tactical decisions that interrupt.
  await playToResults(page);

  await expect(page.getByRole('button', { name: 'Enter Another Race' })).toBeVisible({
    timeout: 30_000,
  });
});

async function playToResults(page: Page): Promise<void> {
  const results = page.getByRole('button', { name: 'Enter Another Race' });
  const choice = page.getByTestId('decision-choice').first();
  const deadline = Date.now() + 150_000;

  while (Date.now() < deadline) {
    if (await results.isVisible().catch(() => false)) return;
    if (await choice.isVisible().catch(() => false)) {
      await choice.click().catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(400);
  }
  throw new Error('Race did not reach the results screen in time');
}
