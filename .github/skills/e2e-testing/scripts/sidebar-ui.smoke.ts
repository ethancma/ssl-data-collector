/**
 * Sidebar navigation and Appearance settings. UI-only (Tier 1 per
 * docs/testing-strategy.md); theme choice is stored locally, not in Supabase.
 */
import { test, expect } from "@playwright/test";
import { gotoHydrated, login, TECH_PASSWORD } from "./helpers";

test.describe("sidebar navigation and appearance", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("Waves logo navigates Home and sidebar has no separate Home or theme action", async ({
    page,
  }) => {
    await login(page);
    await gotoHydrated(page, "/protected/daily-operations");

    const homeLogo = page.getByRole("link", { name: "Home" });
    await expect(homeLogo).toBeVisible();
    await expect(homeLogo).toHaveAttribute("href", "/protected/home");
    await expect(
      page.getByRole("button", { name: /switch to \w+ mode/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /switch to \w+ mode/i }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Expand sidebar" }).click();

    const urlsVisited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urlsVisited.push(frame.url());
    });
    await homeLogo.click();
    await expect(page).toHaveURL(/\/protected\/home$/);
    expect(
      urlsVisited.filter(
        (url) => /\/protected\/?$/.test(new URL(url).pathname) && !url.includes("/protected/home"),
      ),
    ).toEqual([]);
  });

  test("phone layout uses a top bar and modal navigation", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/protected/daily-operations");

    const aside = page.locator("aside");
    const asideBox = await aside.boundingBox();
    const mainBox = await page.locator("main").boundingBox();
    expect(asideBox?.width).toBe(390);
    expect(asideBox?.height).toBe(56);
    expect(mainBox?.y).toBe(56);
    await expect(
      aside.getByRole("navigation", { name: "Main" }),
    ).toBeHidden();

    const menuToggle = page.getByRole("button", { name: "Expand sidebar" });
    await menuToggle.click();
    const menu = page.locator("dialog[open]");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(
      menu.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }),
    ).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(menuToggle).toBeFocused();
    await menuToggle.click();
    await menu.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/protected\/history$/);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("Appearance setting applies immediately and persists after reload", async ({ page }) => {
    await login(page);
    await gotoHydrated(page, "/protected/settings");

    const light = page.getByRole("radio", { name: "Light" });
    const dark = page.getByRole("radio", { name: "Dark" });
    const system = page.getByRole("radio", { name: "System" });
    await expect(light).toBeVisible();
    await expect(dark).toBeVisible();
    await expect(system).toBeVisible();
    await expect(
      page.getByText("System follows your device setting. Your choice is saved on this device."),
    ).toBeVisible();

    await page.getByText("Light", { exact: true }).click();
    await expect(light).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
    ).toBe(false);

    await light.focus();
    await page.keyboard.press("ArrowRight");
    await expect(dark).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
    ).toBe(true);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
    ).toBe(true);

    await page.getByText("System", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
  });
});
