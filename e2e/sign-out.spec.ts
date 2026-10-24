import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("settings has a sign-out button that returns to /login", async ({ page }) => {
  await loginAs(page, "A");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});
