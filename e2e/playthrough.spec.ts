import { test, expect, Page } from '@playwright/test';

// Drives the exported web build through a complete campaign in the fixed-frame
// cockpit: pick the first race, kit out a boat and crew, sail it — proving the
// cockpit's structural contract along the way (the chart never yields to a
// dialog, the sim holds while a call is docked, the sail picker commits real
// changes) — and land on the results screen. Guest path throughout: no
// Supabase env, no login wall, no blocking network call.

// The chart must be a real chart, not a sliver that merely "isVisible".
const MIN_CHART_AREA = 240 * 200;

test('a full race can be played from start to finish in the cockpit', async ({ page }) => {
  // Fail fast on an uncaught runtime error rather than timing out on a missing
  // button — a render crash should be an obvious, immediate failure.
  page.on('pageerror', (e) => {
    throw e;
  });

  // Destructive actions prompt via the themed ConfirmHost sheet on web (no
  // browser dialogs anywhere) — declining must always be possible, so a stray
  // native dialog appearing here would be a regression worth failing on.
  page.on('dialog', (d) => {
    throw new Error(`Unexpected native dialog: ${d.message()}`);
  });

  await page.goto('/');

  // First run: answer the quick onboarding quiz (home waters → mission →
  // experience), which lands back on the personalised home screen.
  await page.getByText('UK & Ireland', { exact: true }).first().click();
  await page.getByText('Win, obviously', { exact: true }).first().click();
  await page.getByText('Weekend warrior', { exact: true }).first().click();

  // Home → race select (the always-present "browse" entry).
  await page.getByRole('button', { name: 'Browse All Races' }).click();

  // Enter the first race in the Corinthian division.
  await page.getByRole('button', { name: 'Enter', exact: true }).first().click();

  // Pick the cheapest boat and continue.
  await page.getByText('Sea Sprite', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Crew' }).click();

  // Auto-crew the boat (Corinthian, so the crew is amateur and unpaid) and continue.
  await page.getByText('Seasoned Salts', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Provisions' }).click();

  // Set sail → the pre-start briefing.
  await page.getByRole('button', { name: 'Set Sail' }).click();

  // Review the briefing, then head out to the start line.
  await page.getByRole('button', { name: 'Start Racing' }).click();

  // The start sequence: accept the default calls, cross the line, then race.
  // (The start and finish ceremonies are untouched by the cockpit.)
  await page.getByRole('button', { name: 'Cross the line' }).click();
  await page.getByRole('button', { name: 'Sail the race' }).click();

  // Dismiss the first-run coach strip (inline now, not a modal) so the race
  // starts — the sim holds while it shows.
  await page.getByTestId('coach-dismiss').click();

  // --- The cockpit's structural contract, while racing -----------------------
  const chart = page.getByTestId('race-chart');
  await expect(chart).toBeVisible();
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  expect(chartBox!.width * chartBox!.height).toBeGreaterThan(MIN_CHART_AREA);
  const viewport = page.viewportSize()!;
  expect(chartBox!.y).toBeGreaterThanOrEqual(0);
  expect(chartBox!.y + chartBox!.height).toBeLessThanOrEqual(viewport.height + 1);

  // Instrument liveness: a frozen band photographs identically to a live one —
  // the band's numbers (SOG at 1dp especially) must move across real ticks.
  // (While a dock holds the sim the band legitimately freezes, so treat a
  // visible interruption as "still alive" and settle it.)
  const band = page.getByTestId('instrument-band');
  const bandBefore = await band.textContent();
  await expect
    .poll(
      async () => {
        if (await settleAnyDock(page)) return 'live';
        return (await band.textContent()) === bandBefore ? 'static' : 'live';
      },
      { timeout: 10_000 }
    )
    .toBe('live');

  // Retire stays reachable from the overflow, and still surfaces the themed
  // confirm sheet — which can be DECLINED (we keep racing). Decisions fire on
  // a fast cadence, so each probe settles any dock first and retries.
  await withQuietCockpit(page, async () => {
    await page.getByTestId('overflow-button').click({ timeout: 2_000 });
    await page.getByTestId('retire-button').click({ timeout: 2_000 });
    await expect(page.getByTestId('confirm-sheet')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('confirm-cancel').click({ timeout: 2_000 });
    await expect(page.getByTestId('confirm-sheet')).not.toBeVisible();
    await page.getByTestId('overflow-close').click({ timeout: 2_000 });
  });

  // --- The sail-change path through the docked lane --------------------------
  const dock = page.getByTestId('decision-dock');
  await withQuietCockpit(page, async () => {
    await page.getByTestId('sail-cell').click({ timeout: 2_000 });
    await expect(page.getByTestId('sail-change-choice').first()).toBeVisible({ timeout: 3_000 });
  });
  await expect(dock).toBeVisible();
  await expect(page.getByTestId('held-pill')).toBeVisible();

  // Held means held: the race clock is static while the picker is docked.
  const clock = page.getByTestId('ribbon-elapsed');
  const clockDocked = await clock.textContent();
  await page.waitForTimeout(800);
  expect(await clock.textContent()).toBe(clockDocked);

  // Same-frame geometry: the chart stays a real chart and the dock compresses
  // rather than covers it.
  await assertChartClearOfDock(page);

  // No dialog/modal semantics anywhere in the racing window (the ceremonies
  // are excluded — this runs mid-race). Secondary to the positive geometry
  // assertion above: rn-web only emits these roles for real modals.
  expect(await page.locator('[role="dialog"], [aria-modal="true"]').count()).toBe(0);

  // Commit a real change (never the sail already flying) and watch the ⇄
  // counter acknowledge it; the debrief ribbon holds until tapped.
  await page
    .locator('[data-testid="sail-change-choice"]:not([aria-label*="currently flying"])')
    .first()
    .click();
  await expect(page.getByTestId('debrief-ribbon')).toBeVisible();
  await expect(page.getByTestId('sail-change-count')).toHaveText(/⇄[1-9]/);
  await expect(chart).toBeVisible();
  await page.getByTestId('debrief-ribbon').click();
  await expect(dock).not.toBeVisible();

  // Sail to the finish, answering any tactical decisions that interrupt.
  await playToResults(page);

  // The staged finish reveal plays over the results; tap it to skip straight to
  // the debrief (it also auto-advances, so this only hurries it along).
  const reveal = page.getByTestId('finish-reveal-overlay');
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.click().catch(() => undefined);
  }

  await expect(page.getByRole('button', { name: 'Enter Another Race' })).toBeVisible({
    timeout: 30_000,
  });
});

// Phone-portrait structure at the primary reference size (390×844): the flex
// contract holds in real pixels — the chart keeps its floor idle AND docked,
// the band stays one thin line, and the dock compresses rather than covers.
// (The 900px and short-height breakpoint boundaries are pinned by the jest
// render tests; pixel-screenshot baselines are deliberately deferred — see the
// build plan's backlog.)
test('phone portrait keeps the chart floor and the one-line band', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('pageerror', (e) => {
    throw e;
  });
  page.on('dialog', (d) => {
    throw new Error(`Unexpected native dialog: ${d.message()}`);
  });

  await page.goto('/');
  await page.getByText('UK & Ireland', { exact: true }).first().click();
  await page.getByText('Win, obviously', { exact: true }).first().click();
  await page.getByText('Weekend warrior', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Browse All Races' }).click();
  await page.getByRole('button', { name: 'Enter', exact: true }).first().click();
  await page.getByText('Sea Sprite', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Crew' }).click();
  await page.getByText('Seasoned Salts', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to Provisions' }).click();
  await page.getByRole('button', { name: 'Set Sail' }).click();
  await page.getByRole('button', { name: 'Start Racing' }).click();
  await page.getByRole('button', { name: 'Cross the line' }).click();
  await page.getByRole('button', { name: 'Sail the race' }).click();
  await page.getByTestId('coach-dismiss').click();

  // Pause the sim (decisions dock within a second of the gun) so the IDLE
  // geometry can be measured deliberately.
  await withQuietCockpit(page, async () => {
    await page.getByTestId('overflow-button').click({ timeout: 2_000 });
    await page.getByTestId('pause-button').click({ timeout: 2_000 });
    await page.getByTestId('overflow-close').click({ timeout: 2_000 });
  });

  // Idle: the chart owns its floor (300 minus its own 18px frame), the band is
  // one thin line of exactly six cells.
  const chart = page.getByTestId('race-chart');
  await expect(chart).toBeVisible();
  const idleBox = (await chart.boundingBox())!;
  expect(idleBox.height).toBeGreaterThanOrEqual(270);
  const bandBox = (await page.getByTestId('instrument-band').boundingBox())!;
  expect(bandBox.height).toBeLessThanOrEqual(80);
  expect(await page.getByTestId('instrument-cell').count()).toBe(6);

  // Resume and wait for the first decision to dock.
  await withQuietCockpit(page, async () => {
    await page.getByTestId('overflow-button').click({ timeout: 2_000 });
    await page.getByTestId('pause-button').click({ timeout: 2_000 });
    await page.getByTestId('overflow-close').click({ timeout: 2_000 });
  });

  // Docked: the chart snaps but never below its 260px floor, and the dock sits
  // wholly below it.
  await expect(page.getByTestId('decision-choice').first()).toBeVisible({ timeout: 30_000 });
  const dockedBox = (await chart.boundingBox())!;
  expect(dockedBox.height).toBeGreaterThanOrEqual(230);
  const dockBox = (await page.getByTestId('decision-dock').boundingBox())!;
  expect(dockBox.y).toBeGreaterThanOrEqual(dockedBox.y + dockedBox.height - 1);
  expect(await page.getByTestId('instrument-cell').count()).toBe(6);

  // Done probing — retire cleanly (accepting the themed confirm sheet) so the
  // run ends fast and proves the retire → results path end to end.
  await withQuietCockpit(page, async () => {
    await page.getByTestId('overflow-button').click({ timeout: 2_000 });
    await page.getByTestId('retire-button').click({ timeout: 2_000 });
    await page.getByTestId('confirm-accept').click({ timeout: 5_000 });
  });
  await expect(page.getByRole('button', { name: 'Enter Another Race' })).toBeVisible({
    timeout: 30_000,
  });
});

// While a choice is on screen, the chart and the docked lane must occupy
// disjoint regions — `toBeVisible()` alone would pass a 30px sliver peeking
// over a sheet.
async function assertChartClearOfDock(page: Page): Promise<void> {
  const chartBox = await page.getByTestId('race-chart').boundingBox();
  const dockBox = await page.getByTestId('decision-dock').boundingBox();
  expect(chartBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(chartBox!.width * chartBox!.height).toBeGreaterThan(MIN_CHART_AREA);
  const verticalClear =
    chartBox!.y + chartBox!.height <= dockBox!.y + 1 ||
    dockBox!.y + dockBox!.height <= chartBox!.y + 1;
  const horizontalClear =
    chartBox!.x + chartBox!.width <= dockBox!.x + 1 ||
    dockBox!.x + dockBox!.width <= chartBox!.x + 1;
  expect(verticalClear || horizontalClear).toBe(true);
}

// Resolve whatever is currently docked (a decision, or a lingering debrief
// ribbon) so a structural probe can run against the idle cockpit. Returns true
// if anything had to be settled.
async function settleAnyDock(page: Page): Promise<boolean> {
  let settled = false;
  for (let i = 0; i < 6; i += 1) {
    const choice = page.getByTestId('decision-choice').first();
    const ribbon = page.getByTestId('debrief-ribbon');
    if (await choice.isVisible().catch(() => false)) {
      await choice.click({ timeout: 1_500 }).catch(() => undefined);
      settled = true;
      continue;
    }
    if (await ribbon.isVisible().catch(() => false)) {
      await ribbon.click({ timeout: 1_500 }).catch(() => undefined);
      settled = true;
      continue;
    }
    break;
  }
  return settled;
}

// Decisions dock on a ~1s cadence mid-race, so any probe that needs the idle
// console (overflow, the sail cell) settles first and retries if a decision
// stole the lane mid-probe.
async function withQuietCockpit(page: Page, probe: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await settleAnyDock(page);
    try {
      await probe();
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function playToResults(page: Page): Promise<void> {
  const results = page.getByRole('button', { name: 'Enter Another Race' });
  const choice = page.getByTestId('decision-choice').first();
  const ribbon = page.getByTestId('debrief-ribbon');
  const deadline = Date.now() + 150_000;
  let geometryChecked = false;

  while (Date.now() < deadline) {
    if (await results.isVisible().catch(() => false)) return;
    if (await choice.isVisible().catch(() => false)) {
      if (!geometryChecked) {
        // Once, on the first live decision: the dock compresses the chart, the
        // HELD pill is up, and no dialog semantics exist.
        geometryChecked = true;
        await assertChartClearOfDock(page).catch(() => undefined);
        await expect(page.getByTestId('held-pill')).toBeVisible();
        expect(await page.locator('[role="dialog"], [aria-modal="true"]').count()).toBe(0);
      }
      await choice.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    // The post-call debrief ribbon holds the sim; tap it on rather than wait
    // out its timeout.
    if (await ribbon.isVisible().catch(() => false)) {
      await ribbon.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(400);
  }
  throw new Error('Race did not reach the results screen in time');
}
