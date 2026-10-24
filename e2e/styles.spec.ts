import { expect, test } from "@playwright/test";

// Guards against Tailwind silently not running: the login page's <main> uses
// `flex min-h-dvh`, so an unstyled page would report display "block".
test("Tailwind styles are applied", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("main")).toHaveCSS("display", "flex");
});
