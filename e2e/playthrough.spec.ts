import { test, expect, Page } from '@playwright/test';

// Drives the exported web build through a complete campaign in the fixed-frame
// cockpit: pick the first race, kit out a boat and crew, sail it — proving the
// cockpit's structural contract along the way (the chart never yields to a
// dialog, the race keeps SAILING while a call or the sail picker is docked —
// only a MOB holds — and the sail picker commits real changes) — and land on
// the results screen. Guest path throughout: no Supabase env, no login wall,
// no blocking network call.

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
  // (Only a MOB holds the sim now, so treat a visible interruption as "still
  // alive" and settle it.)
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

  // The race no longer waits for docked calls, so it barrels toward the finish
  // in real seconds — pause it for the deliberate structural probes below.
  await setSimPaused(page, true);

  // Retire stays reachable from the overflow, and still surfaces the themed
  // confirm sheet — which can be DECLINED (we keep racing).
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

  // Same-frame geometry: the chart stays a real chart and the dock compresses
  // rather than covers it.
  await assertChartClearOfDock(page);

  // No dialog/modal semantics anywhere in the racing window (the ceremonies
  // are excluded — this runs mid-race). Secondary to the positive geometry
  // assertion above: rn-web only emits these roles for real modals.
  expect(await page.locator('[role="dialog"], [aria-modal="true"]').count()).toBe(0);

  // Commit a real change (never the sail already flying) and watch the ⇄
  // counter acknowledge it (a commit works even while paused — it is a call,
  // not a tick); the debrief ribbon docks until tapped or timed out.
  await page
    .locator('[data-testid="sail-change-choice"]:not([aria-label*="currently flying"])')
    .first()
    .click();
  await expect(page.getByTestId('debrief-ribbon')).toBeVisible();
  await expect(page.getByTestId('sail-change-count')).toHaveText(/⇄[1-9]/);
  await expect(chart).toBeVisible();
  await page.getByTestId('debrief-ribbon').click();
  await expect(dock).not.toBeVisible();

  // --- The sail-plan dial: the auto-helm flies the wardrobe itself -----------
  // The dial sits in the control console (paused now, so it holds still). Flip
  // it to the keenest auto-helm and prove the ⇄ counter then climbs with NO
  // further manual picks — the boat is calling its own sails.
  const countBadge = page.getByTestId('sail-change-count');
  const changeCount = async (): Promise<number> =>
    parseInt(((await countBadge.textContent()) ?? '').replace(/\D/g, ''), 10) || 0;
  const beforeAuto = await changeCount();
  await page.getByTestId('sail-plan-control').getByText('Aggress', { exact: false }).click({ timeout: 2_000 });
  await setSimPaused(page, false);
  await expect
    .poll(
      async () => {
        await settleAnyDock(page);
        return (await changeCount()) > beforeAuto;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  await setSimPaused(page, true);

  // Resume, and prove the two-speed contract: the sail picker ALONE never
  // holds (the clock runs beneath it), but a docked DECISION stops the watch —
  // and the picker still opens and closes over the held call, handing the
  // lane back to it.
  await setSimPaused(page, false);
  await withQuietCockpit(page, async () => {
    await page.getByTestId('sail-cell').click({ timeout: 2_000 });
    await expect(page.getByTestId('sail-change-choice').first()).toBeVisible({ timeout: 3_000 });
    const clock = page.getByTestId('ribbon-elapsed');
    const before = await clock.textContent();
    await expect
      .poll(async () => (await clock.textContent()) !== before, { timeout: 5_000 })
      .toBe(true);
    await page.getByTestId('sail-dismiss').click({ timeout: 2_000 });
  });

  // Wait for a key decision to dock: the clock must FREEZE (HELD pill up)…
  await expect(page.getByTestId('decision-choice').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('held-pill')).toBeVisible();
  const heldClock = page.getByTestId('ribbon-elapsed');
  const frozen = await heldClock.textContent();
  await page.waitForTimeout(900);
  expect(await heldClock.textContent()).toBe(frozen);
  // …while the wardrobe stays reachable: the picker borrows the lane over the
  // held call and hands it straight back on dismiss.
  await page.getByTestId('sail-cell').click({ timeout: 2_000 });
  await expect(page.getByTestId('sail-change-choice').first()).toBeVisible({ timeout: 3_000 });
  await page.getByTestId('sail-dismiss').click({ timeout: 2_000 });
  await expect(page.getByTestId('decision-choice').first()).toBeVisible({ timeout: 3_000 });
  await page.getByTestId('decision-choice').first().click();
  const ribbonAfter = page.getByTestId('debrief-ribbon');
  if (await ribbonAfter.isVisible().catch(() => false)) {
    await ribbonAfter.click().catch(() => undefined);
  }

  // Sail to the finish, answering any tactical decisions that dock.
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

  // The earn-moment: finishing the race unlocks at least First Blood, which is
  // shown inline on the results as a NEW HONOURS card.
  await expect(page.getByTestId('results-new-honours')).toBeVisible();
  await expect(page.getByTestId('new-honour-first-blood')).toBeVisible();

  // Head back to the harbour and open the Sailor's Card — the honours strip is
  // there, and the Trophy Case is one tap away.
  await page.getByRole('button', { name: 'Back to Harbour' }).click();
  await page.getByText('Profile', { exact: true }).first().click();
  await expect(page.getByTestId('profile-honours-strip')).toBeVisible({ timeout: 10_000 });

  // The game-mode toggle: Free Sailing is the front door (the whole run above
  // sailed it — no fees, no ledgers), and Campaign is the opt-in budget game.
  // Flip it and prove the budget UI comes back: in Free Sailing the funds row
  // reads "Free Sailing" (so the string appears twice — toggle label + value);
  // in Campaign the value becomes money and only the toggle label remains.
  await expect(page.getByTestId('free-sailing-toggle')).toBeVisible();
  await expect(page.getByText('Free Sailing', { exact: true })).toHaveCount(2);
  await page.getByText('Campaign', { exact: true }).first().click();
  await expect(page.getByText('Free Sailing', { exact: true })).toHaveCount(1);
  await page.getByTestId('view-trophy-case').click();
  await expect(page.getByTestId('trophy-case')).toBeVisible({ timeout: 10_000 });
  // First Blood is earned, so its tile shows without expanding the locked goals.
  await expect(page.getByTestId('honour-first-blood')).toBeVisible();
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
  await setSimPaused(page, true);

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
  await setSimPaused(page, false);

  // Docked: the chart snaps but never below its 260px floor, and the dock sits
  // wholly below it. A docked card holds the watch, so it cannot vanish
  // between visibility and measurement — the retry loop stays purely as
  // belt-and-braces against animation timing.
  let measured = false;
  for (let attempt = 0; attempt < 8 && !measured; attempt += 1) {
    await expect(page.getByTestId('decision-choice').first()).toBeVisible({ timeout: 30_000 });
    const dockedBox = await chart.boundingBox();
    const dockBox = await page.getByTestId('decision-dock').boundingBox();
    if (!dockedBox || !dockBox) continue; // the moment passed mid-measure — next card
    expect(dockedBox.height).toBeGreaterThanOrEqual(230);
    expect(dockBox.y).toBeGreaterThanOrEqual(dockedBox.y + dockedBox.height - 1);
    measured = true;
  }
  expect(measured).toBe(true);
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

// Drive the pause toggle to a TARGET state (never blind-click it — a retried
// probe would toggle the sim straight back). The button's label is the truth:
// it reads "Pause" while running and "Resume" while paused.
async function setSimPaused(page: Page, target: boolean): Promise<void> {
  await withQuietCockpit(page, async () => {
    await page.getByTestId('overflow-button').click({ timeout: 2_000 });
    const pauseButton = page.getByTestId('pause-button');
    await expect(pauseButton).toBeVisible({ timeout: 2_000 });
    const label = (await pauseButton.textContent()) ?? '';
    const paused = /resume/i.test(label);
    if (paused !== target) await pauseButton.click({ timeout: 2_000 });
    await page.getByTestId('overflow-close').click({ timeout: 2_000 });
  });
}

async function playToResults(page: Page): Promise<void> {
  const results = page.getByRole('button', { name: 'Enter Another Race' });
  const choice = page.getByTestId('decision-choice').first();
  const ribbon = page.getByTestId('debrief-ribbon');
  const deadline = Date.now() + 150_000;
  let geometryChecked = false;

  while (Date.now() < deadline) {
    if (await results.isVisible().catch(() => false)) return;
    // A docked card holds the watch until answered (or waved off) — answer
    // promptly, and treat a click landing on a card dismissed mid-flight as a
    // miss to poll past, never a failure.
    if (await choice.isVisible().catch(() => false)) {
      if (!geometryChecked) {
        // Once, on the first docked decision: the dock compresses the chart
        // and no dialog semantics exist (the held-clock contract is asserted
        // explicitly in the main test body).
        geometryChecked = true;
        await assertChartClearOfDock(page).catch(() => undefined);
        expect(await page.locator('[role="dialog"], [aria-modal="true"]').count()).toBe(0);
      }
      await choice.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    // The post-call debrief ribbon is informational (the sim sails on) — tap
    // it away rather than wait out its timeout.
    if (await ribbon.isVisible().catch(() => false)) {
      await ribbon.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(400);
  }
  throw new Error('Race did not reach the results screen in time');
}
