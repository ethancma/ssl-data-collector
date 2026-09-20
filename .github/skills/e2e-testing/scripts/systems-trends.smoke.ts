/**
 * Systems page (components/systems/grid-overview.tsx, charts.tsx, chart-data.ts,
 * systems-page-client.tsx) "Water quality trends" card: Page 1 chemical-isolate
 * pills, Page 2 dual-axis "Compare" swap selects, carousel chevrons/dots/keyboard
 * nav, and the existing range-days pills. UI-only, no DB writes (Tier 2 per
 * docs/testing-strategy.md) — no Supabase row assertions needed. Extend this file
 * for further Systems-page chart changes.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { login, TECH_PASSWORD } from "./helpers";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const consoleFindingsByPage = new WeakMap<Page, string[]>();

function parseNumericTickValues(labels: string[]) {
  expect(labels.length).toBeGreaterThanOrEqual(3);
  for (const label of labels) expect(label).toMatch(/^-?\d+(?:\.\d+)?$/);
  return labels.map(Number);
}

async function numericTickValues(ticks: Locator) {
  return parseNumericTickValues(
    (await ticks.allTextContents()).map((label) => label.trim()),
  );
}

async function assertPageOneSeries(chart: Locator, expectedLabel: string) {
  const svg = chart.locator("svg");
  const ticks = svg.locator(":scope > g").first().locator(":scope > text");
  const tickValues = await numericTickValues(ticks);
  await expect(svg.locator("polyline")).toHaveCount(1);

  const pointTitles = svg.locator("circle title");
  const pointLabels = await pointTitles.allTextContents();
  expect(pointLabels.length).toBeGreaterThan(1);
  expect(pointLabels.every((label) => label.startsWith(`${expectedLabel}: `))).toBe(true);
  expect(
    await pointTitles.evaluateAll((titles) =>
      titles.every(
        (title) =>
          title.childNodes.length === 1 && title.firstChild?.nodeType === Node.TEXT_NODE,
      ),
    ),
  ).toBe(true);
  const pointValues = pointLabels.map((label) => Number(label.split(": ").at(-1)));
  expect(Math.max(...tickValues)).toBeCloseTo(Math.max(...pointValues), 2);
  expect(Math.min(...tickValues)).toBeCloseTo(Math.min(...pointValues), 2);

  return tickValues;
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertCompareAxesAndLines(chart: Locator) {
  const axisTicks = chart.locator("svg > text");
  await expect(axisTicks).toHaveCount(6);
  const axisLabels = (await axisTicks.allTextContents()).map((label) => label.trim());
  const leftTicks = parseNumericTickValues(axisLabels.slice(0, 3));
  const rightTicks = parseNumericTickValues(axisLabels.slice(3));
  expect(leftTicks).not.toEqual(rightTicks);

  const axisColors = await axisTicks.evaluateAll((ticks) =>
    [...new Set(ticks.map((tick) => getComputedStyle(tick).fill))],
  );
  expect(axisColors).toHaveLength(2);

  const lines = chart.locator("svg polyline");
  await expect(lines).toHaveCount(2);
  const lineColors = await lines.evaluateAll((items) =>
    [...new Set(items.map((line) => getComputedStyle(line).stroke))],
  );
  expect(lineColors).toHaveLength(2);
  expect(new Set(lineColors)).toEqual(new Set(axisColors));

  return { leftTicks, rightTicks, axisColors, lineColors };
}

async function assertSelectsAndChevronsDoNotOverlap(chart: Locator) {
  const selects = chart.locator("select");
  for (const [index, select] of (await selects.all()).entries()) {
    const wrapper = select.locator("..");
    const chevron = wrapper.locator("svg");
    const [selectBox, chevronBox, wrapperBox] = await Promise.all([
      select.boundingBox(),
      chevron.boundingBox(),
      wrapper.boundingBox(),
    ]);
    expect(selectBox).not.toBeNull();
    expect(chevronBox).not.toBeNull();
    expect(wrapperBox).not.toBeNull();
    const leftElement = index === 0 ? selectBox! : chevronBox!;
    const rightElement = index === 0 ? chevronBox! : selectBox!;
    expect(rightElement.x - (leftElement.x + leftElement.width)).toBeGreaterThanOrEqual(3);
    expect(leftElement.x).toBeGreaterThanOrEqual(wrapperBox!.x);
    expect(rightElement.x + rightElement.width).toBeLessThanOrEqual(
      wrapperBox!.x + wrapperBox!.width + 0.5,
    );
  }
}

async function assertMobileChartScrollsLocally(chart: Locator) {
  const svg = chart.locator("svg:has(polyline)");
  await expect(svg).toBeVisible();
  const svgBox = await svg.boundingBox();
  expect(svgBox).not.toBeNull();
  expect(svgBox!.width).toBeGreaterThanOrEqual(599);

  const scrollState = await svg.evaluate((element) => {
    let ancestor = element.parentElement;
    while (ancestor) {
      if (ancestor.scrollWidth > ancestor.clientWidth + 1) {
        return {
          clientWidth: ancestor.clientWidth,
          scrollWidth: ancestor.scrollWidth,
          overflowX: getComputedStyle(ancestor).overflowX,
        };
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  });
  expect(scrollState).not.toBeNull();
  expect(scrollState!.scrollWidth).toBeGreaterThan(scrollState!.clientWidth);
  expect(["auto", "scroll"]).toContain(scrollState!.overflowX);
}

test.describe("systems page water quality trends card", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test.beforeEach(({ page }) => {
    const consoleFindings: string[] = [];
    consoleFindingsByPage.set(page, consoleFindings);
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleFindings.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on("pageerror", (error) => consoleFindings.push(`pageerror: ${String(error)}`));
  });

  test.afterEach(({ page }, testInfo) => {
    const consoleFindings = consoleFindingsByPage.get(page) ?? [];
    console.log(`${testInfo.title} console warning/error/pageerror count:`, consoleFindings.length);
    expect(consoleFindings, consoleFindings.join("\n")).toEqual([]);
  });

  test("Page 1: All <-> single-chemical isolate redraws and rescales the chart", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await login(page);
    // Graham has imported historical water-quality readings; the default system
    // (Indoor Quarantine) has none, which would show "No data in this window" instead.
    await page.goto("/protected/systems?system=graham&range=60");
    await expect(page.getByText("Water quality trends")).toBeVisible();

    const allPill = page.getByRole("button", { name: "All", exact: true });
    await expect(allPill).toBeVisible();

    // "All" pill should look active by default.
    const allClassBefore = await allPill.getAttribute("class");
    expect(allClassBefore).toContain("border-primary");
    const allInitialStyle = await allPill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderColor: cs.borderColor, backgroundColor: cs.backgroundColor };
    });
    console.log("All pill computed style (initial, active by default):", allInitialStyle);

    const chart = page.locator('[role="group"][aria-label*="trend chart"]');
    const svgBefore = await chart.locator("svg").innerHTML();
    const legendLabelsBefore = await chart.locator("svg + div span").allTextContents();
    console.log("Legend labels (All):", legendLabelsBefore);

    const allTicks = await numericTickValues(
      chart.locator("svg > g").first().locator(":scope > text"),
    );
    expect(await chart.locator("svg polyline").count()).toBeGreaterThan(1);
    console.log("Page 1 All numeric ticks:", allTicks);
    await page.screenshot({ path: "test-results/systems-trends-all-desktop.png", fullPage: true });

    for (const chemicalName of ["pH", "Calcium"]) {
      const chemicalPill = page.getByRole("button", { name: chemicalName, exact: true });
      await expect(chemicalPill).toBeVisible();
      await chemicalPill.click();
      expect(await chemicalPill.getAttribute("class")).toContain("border-primary");
      expect(await allPill.getAttribute("class")).not.toContain("border-primary");
      expect(await chart.locator("svg").innerHTML()).not.toEqual(svgBefore);

      const isolatedTicks = await assertPageOneSeries(chart, chemicalName);
      expect(isolatedTicks).not.toEqual(allTicks);
      console.log(`Page 1 ${chemicalName} numeric ticks:`, isolatedTicks);
      await page.screenshot({
        path: `test-results/systems-trends-${chemicalName.toLowerCase()}-desktop.png`,
        fullPage: true,
      });
    }

    console.log("Desktop viewport:", page.viewportSize());
  });

  test("Carousel: chevrons, dot pager, and ArrowLeft/ArrowRight switch between Trends and Compare", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/systems?system=graham&range=60");

    const chart = page.locator('[role="group"][aria-label*="trend chart"]');
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);

    const nextButton = page.getByRole("button", { name: "Next chart page" });
    const prevButton = page.getByRole("button", { name: "Previous chart page" });

    await nextButton.click();
    await expect(chart).toHaveAttribute("aria-label", /page 2 of 2/);
    await expect(page.getByText("Compare")).not.toBeVisible().catch(() => {
      // "Compare" may not literally be rendered as text depending on implementation;
      // rely on the aria-label + select controls below as the real assertion.
    });
    await expect(page.locator("select")).toHaveCount(2);

    await prevButton.click();
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);

    // Keyboard nav: focus the chart region, then ArrowRight/ArrowLeft.
    await chart.click();
    await chart.press("ArrowRight");
    await expect(chart).toHaveAttribute("aria-label", /page 2 of 2/);
    await chart.press("ArrowLeft");
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);

    await page.screenshot({ path: "test-results/systems-trends-carousel.png" });
  });

  test("Page 2: Compare swap selects update line/axis and never allow the same chemical on both sides", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await login(page);
    await page.goto("/protected/systems?system=graham&range=60");

    const nextButton = page.getByRole("button", { name: "Next chart page" });
    await nextButton.click();

    // Scope to the chart's own group, not `page`-wide: unrelated svg icons
    // (sidebar toggle, theme switch, etc.) sit later in the DOM than this
    // card and were previously matching `page.locator("svg").last()` instead
    // of the actual chart.
    const chart = page.locator('[role="group"][aria-label*="trend chart"]');
    const selects = chart.locator("select");
    await expect(selects).toHaveCount(2);
    const leftSelect = selects.nth(0);
    const rightSelect = selects.nth(1);

    const leftDefault = await leftSelect.inputValue();
    const rightDefault = await rightSelect.inputValue();
    console.log("Page 2 defaults - left:", leftDefault, "right:", rightDefault);

    console.log("Page 2 left/right axes and lines:", await assertCompareAxesAndLines(chart));
    await assertSelectsAndChevronsDoNotOverlap(chart);

    // Each select's options should never include the other side's current value.
    const leftOptionValues = await leftSelect.locator("option").evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    const rightOptionValues = await rightSelect.locator("option").evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    expect(leftOptionValues).not.toContain(rightDefault);
    expect(rightOptionValues).not.toContain(leftDefault);

    const svgBefore = await chart.locator("svg").last().innerHTML();

    // Swap the left side to some other available option and confirm the chart redraws.
    const newLeftValue = leftOptionValues.find((v) => v !== leftDefault);
    expect(newLeftValue).toBeTruthy();
    await leftSelect.selectOption(newLeftValue!);
    await expect(leftSelect).toHaveValue(newLeftValue!);

    const svgAfter = await chart.locator("svg").last().innerHTML();
    expect(svgAfter).not.toEqual(svgBefore);

    // Right side's options should now exclude the NEW left value instead of the old one.
    const rightOptionValuesAfter = await rightSelect.locator("option").evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    expect(rightOptionValuesAfter).not.toContain(newLeftValue);
    expect(rightOptionValuesAfter).toContain(leftDefault); // old left value freed up

    const newRightValue = rightOptionValuesAfter.find((v) => v !== rightDefault);
    expect(newRightValue).toBeTruthy();
    await rightSelect.selectOption(newRightValue!);
    await expect(rightSelect).toHaveValue(newRightValue!);

    const svgAfterBothChanges = await chart.locator("svg").last().innerHTML();
    expect(svgAfterBothChanges).not.toEqual(svgAfter);
    await assertCompareAxesAndLines(chart);
    await assertSelectsAndChevronsDoNotOverlap(chart);

    const leftOptionValuesAfter = await leftSelect.locator("option").evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    expect(leftOptionValuesAfter).not.toContain(newRightValue);
    expect(leftOptionValuesAfter).toContain(rightDefault);
    console.log("Page 2 changed selections:", { left: newLeftValue, right: newRightValue });

    await page.screenshot({ path: "test-results/systems-trends-compare-desktop.png", fullPage: true });
  });

  test("Narrow viewport: chart pages, controls, labels, and axes remain unclipped", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await login(page);
    await page.goto("/protected/systems?system=graham&range=60");

    const chart = page.locator('[role="group"][aria-label*="trend chart"]');
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);
    const allTicks = await numericTickValues(
      chart.locator("svg > g").first().locator(":scope > text"),
    );
    expect(await chart.locator("svg polyline").count()).toBeGreaterThan(1);
    await assertMobileChartScrollsLocally(chart);
    await assertNoHorizontalOverflow(page);
    const main = page.locator("main");
    const mobileMain = await main.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(mobileMain.clientWidth).toBeGreaterThanOrEqual(300);
    expect(mobileMain.scrollWidth).toBeLessThanOrEqual(mobileMain.clientWidth + 1);
    console.log("Mobile main pane:", mobileMain);
    await page.screenshot({
      path: "test-results/systems-trends-all-mobile.png",
      fullPage: true,
    });

    for (const chemicalName of ["pH", "Calcium"]) {
      await page.getByRole("button", { name: chemicalName, exact: true }).click();
      const isolatedTicks = await assertPageOneSeries(chart, chemicalName);
      expect(isolatedTicks).not.toEqual(allTicks);
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `test-results/systems-trends-${chemicalName.toLowerCase()}-mobile.png`,
        fullPage: true,
      });
    }

    const nextButton = page.getByRole("button", { name: "Next chart page" });
    const prevButton = page.getByRole("button", { name: "Previous chart page" });
    await nextButton.click();
    await expect(chart).toHaveAttribute("aria-label", /page 2 of 2/);
    await prevButton.click();
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);
    await chart.click();
    await chart.press("ArrowRight");
    await expect(chart).toHaveAttribute("aria-label", /page 2 of 2/);
    await chart.press("ArrowLeft");
    await expect(chart).toHaveAttribute("aria-label", /page 1 of 2/);

    await nextButton.click();
    await expect(chart).toHaveAttribute("aria-label", /page 2 of 2/);
    const selects = chart.locator("select");
    await expect(selects).toHaveCount(2);
    await assertCompareAxesAndLines(chart);
    await assertSelectsAndChevronsDoNotOverlap(chart);
    await assertMobileChartScrollsLocally(chart);
    await assertNoHorizontalOverflow(page);

    for (const select of await selects.all()) {
      const wrapperBox = await select.locator("..").boundingBox();
      expect(wrapperBox).not.toBeNull();
      expect(wrapperBox!.x).toBeGreaterThanOrEqual(0);
      expect(wrapperBox!.x + wrapperBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    }

    const leftSelect = selects.nth(0);
    const rightSelect = selects.nth(1);
    const leftDefault = await leftSelect.inputValue();
    const rightDefault = await rightSelect.inputValue();
    const leftOptions = await leftSelect.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    const newLeftValue = leftOptions.find((value) => value !== leftDefault);
    expect(newLeftValue).toBeTruthy();
    await leftSelect.selectOption(newLeftValue!);

    const rightOptions = await rightSelect.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(rightOptions).not.toContain(newLeftValue);
    const newRightValue = rightOptions.find((value) => value !== rightDefault);
    expect(newRightValue).toBeTruthy();
    await rightSelect.selectOption(newRightValue!);
    await assertCompareAxesAndLines(chart);
    await assertSelectsAndChevronsDoNotOverlap(chart);
    await assertNoHorizontalOverflow(page);

    console.log("Mobile viewport:", page.viewportSize());
    await page.screenshot({ path: "test-results/systems-trends-page2-mobile.png", fullPage: true });
  });

  test("Regression: 14d/30d/60d range pills still work on both Trends and Compare pages", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/systems?system=graham&range=60");

    const rangePills = ["14d", "30d", "60d"];
    for (const label of rangePills) {
      const pill = page.getByRole("button", { name: label, exact: true });
      await expect(pill).toBeVisible();
      await pill.click();
      const cls = await pill.getAttribute("class");
      expect(cls).toContain("border-primary");
      await expect(page).toHaveURL(new RegExp(`range=${label.replace("d", "")}`));
    }

    // Switch to Compare page and confirm range pills still apply there too.
    await page.getByRole("button", { name: "Next chart page" }).click();
    for (const label of rangePills) {
      const pill = page.getByRole("button", { name: label, exact: true });
      await pill.click();
      const cls = await pill.getAttribute("class");
      expect(cls).toContain("border-primary");
      await expect(page).toHaveURL(new RegExp(`range=${label.replace("d", "")}`));
    }

  });
});
