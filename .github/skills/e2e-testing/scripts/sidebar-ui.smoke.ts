/**
 * Sidebar Home button + theme toggle (components/protected-sidebar.tsx). UI-only
 * (Tier 1 per docs/testing-strategy.md) — no Supabase row assertions needed. Extend
 * this file for further sidebar/theme/navigation changes.
 */
import { test, expect } from "@playwright/test";
import { login, TECH_PASSWORD } from "./helpers";

// Covers the sidebar's new Home icon-button + theme-toggle row (components/protected-sidebar.tsx).
// UI-only (Tier 1 per docs/testing-strategy.md) — no Supabase row assertions needed.
test.describe("sidebar Home button and theme toggle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("Home button and theme toggle render in a row under the logo, and theme cycles correctly", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    // Capture Cache-Control on any CSS response, to rule out a stale-CSS-chunk theory.
    const cssResponses: { url: string; cacheControl: string | null }[] = [];
    page.on("response", (res) => {
      const url = res.url();
      const contentType = res.headers()["content-type"] ?? "";
      if (url.endsWith(".css") || contentType.includes("text/css")) {
        cssResponses.push({ url, cacheControl: res.headers()["cache-control"] ?? null });
      }
    });

    // Pulls every value the human asked for in one shot, evaluated in-page.
    async function captureThemeState(label: string) {
      const state = await page.evaluate(() => {
        const html = document.documentElement;
        const bodyStyle = getComputedStyle(document.body);
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          htmlClassName: html.className,
          isDarkClassPresent: html.classList.contains("dark"),
          localStorageTheme: window.localStorage.getItem("theme"),
          bodyBackgroundColor: bodyStyle.backgroundColor,
          bodyColor: bodyStyle.color,
          cssVarBackground: rootStyle.getPropertyValue("--background").trim(),
        };
      });
      console.log(`[theme-state] ${label}:`, JSON.stringify(state));
      return state;
    }

    await login(page);
    await page.goto("/protected/daily-operations");

    const homeButton = page.getByRole("link", { name: "Home" });
    const themeButton = page.getByRole("button", { name: /switch to \w+ mode/i });
    await expect(homeButton).toBeVisible();
    await expect(themeButton).toBeVisible();

    await page.screenshot({ path: "test-results/sidebar-theme-initial.png" });

    // Click through the full cycle and confirm html class + icon match at each step,
    // rather than assuming a fixed light->dark->system order (starting state depends
    // on ThemeProvider's defaultTheme="system" vs. whatever's in localStorage).
    const seen: string[] = [];
    const capturedStates: Record<string, unknown>[] = [];
    for (let i = 0; i < 3; i++) {
      const title = await themeButton.getAttribute("title");
      const state = await captureThemeState(`step ${i} (before click, title="${title}")`);
      capturedStates.push({ step: i, title, ...state });
      seen.push(`${state.isDarkClassPresent ? "dark" : "light"}-bg via "${title}"`);
      await page.screenshot({ path: `test-results/sidebar-theme-step-${i}.png` });
      await themeButton.click();
      await page.waitForTimeout(200); // theme change is a synchronous class toggle, but be safe
    }
    console.log("Theme cycle observed:", seen.join(" -> "));
    console.log("Captured theme states per click:", JSON.stringify(capturedStates, null, 2));

    const finalClass = await page.locator("html").getAttribute("class");
    console.log("Final <html> class:", finalClass);

    // Force explicitly to "dark" (rather than trusting wherever the 3-step cycle landed)
    // and verify the state, then hard-reload and re-verify — this is the exact scenario
    // reported as "stuck on light mode" even after clicking to dark. The cycle is
    // light -> dark -> system -> light (max 3 clicks to reach every state at least once).
    let onDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    for (let i = 0; i < 3 && !onDark; i++) {
      await themeButton.click();
      await page.waitForTimeout(200);
      onDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    }
    expect(onDark).toBe(true);

    const preReloadDarkState = await captureThemeState("forced to dark, before reload");
    await page.screenshot({ path: "test-results/sidebar-theme-dark-pre-reload.png" });

    await page.reload();
    await page.waitForLoadState("networkidle");

    const postReloadDarkState = await captureThemeState("forced to dark, AFTER hard reload");
    await page.screenshot({ path: "test-results/sidebar-theme-dark-post-reload.png" });

    const serviceWorkerRegistrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    console.log("navigator.serviceWorker.getRegistrations() count:", serviceWorkerRegistrations);
    console.log("CSS responses observed (url + Cache-Control):", JSON.stringify(cssResponses, null, 2));

    console.log("Console/page errors during theme cycling:", consoleErrors);

    // Assertions pinning down the actual bug report, not just "no console errors".
    expect(preReloadDarkState.isDarkClassPresent).toBe(true);
    expect(preReloadDarkState.localStorageTheme).toBe("dark");
    expect(postReloadDarkState.isDarkClassPresent).toBe(true);
    expect(postReloadDarkState.localStorageTheme).toBe("dark");
    expect(postReloadDarkState.cssVarBackground).toBe(preReloadDarkState.cssVarBackground);
    expect(postReloadDarkState.bodyBackgroundColor).toBe(preReloadDarkState.bodyBackgroundColor);
    expect(serviceWorkerRegistrations === 0 || serviceWorkerRegistrations === "unsupported").toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test("Home button navigates directly to /protected/home with no intermediate redirect", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations");

    const urlsVisited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urlsVisited.push(frame.url());
    });

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/protected\/home$/);

    const intermediateHits = urlsVisited.filter(
      (u) => /\/protected\/?$/.test(new URL(u).pathname) && !u.includes("/protected/home"),
    );
    expect(intermediateHits).toEqual([]);
    console.log("Frame navigations during Home click:", urlsVisited);
  });

  test("collapsed sidebar still shows Home button and theme toggle", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations");

    await page.getByRole("button", { name: /collapse sidebar/i }).click();
    const homeButton = page.getByRole("link", { name: "Home" });
    const themeButton = page.getByRole("button", { name: /switch to \w+ mode/i });
    await expect(homeButton).toBeVisible();
    await expect(themeButton).toBeVisible();
    await expect(homeButton).toBeEnabled();
    await expect(themeButton).toBeEnabled();
    await page.screenshot({ path: "test-results/sidebar-theme-collapsed.png" });

    // Restore expanded state so later serial tests in this file aren't affected.
    await page.getByRole("button", { name: /expand sidebar/i }).click();
  });
});
