import { expect, type Page } from "@playwright/test";
import { USERS, type UserKey } from "./seed-data";

/** Signs in through the real login form as a seeded user (Y = admin, A, M). */
export async function loginAs(page: Page, who: UserKey): Promise<void> {
  const u = USERS[who];
  await page.goto("/login");
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 }); // the first page after a cold server start compiles slowly
}
