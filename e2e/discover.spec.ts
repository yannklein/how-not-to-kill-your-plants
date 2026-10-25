import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";
import { SPOT_NAME } from "./seed-data";

test("discover a plant, save it, buy it and add it", async ({ page }) => {
  await loginAs(page, "Y");
  await page.goto("/discover");
  await page.getByLabel("Where will it live?").selectOption({ label: SPOT_NAME });
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("discover-card")).toHaveCount(5);

  const calathea = page.getByTestId("discover-card").filter({ hasText: "Calathea orbifolia" });
  await calathea.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(calathea.getByRole("button", { name: "Saved ✓" })).toBeVisible();

  await page.goto("/wishlist");
  const wish = page.getByTestId("wish").filter({ hasText: "Calathea orbifolia" });
  await expect(wish).toHaveCount(1);
  await wish.getByRole("link", { name: "I bought it" }).click();
  await expect(page).toHaveURL(/\/plants\/new\?/);

  await page.locator('input[type="file"]').first().setInputFiles(path.resolve(__dirname, "fixtures/pilea.jpg"));
  await expect(page.getByLabel("Species", { exact: true })).toHaveValue("Calathea orbifolia");
  await page.getByRole("button", { name: "Looks right, add it" }).click();
  await expect(page).toHaveURL(/\/plants\/[0-9a-f-]{36}$/);

  await page.goto("/wishlist");
  await expect(page.getByTestId("wish").filter({ hasText: "Calathea orbifolia" })).toHaveCount(0);
});
