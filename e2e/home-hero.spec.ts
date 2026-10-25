import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { todayIn } from "@/lib/time";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS } from "./seed-data";

async function seedPlant(name: string): Promise<void> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.YA}`;
    const [h] = await sql`select timezone from home limit 1`;
    await sql`insert into plant (group_id, name, acquired_on) values (${g.id}, ${name}, ${todayIn(h.timezone)})`;
  } finally {
    await sql.end();
  }
}

test("home opens with the title, a greeting and the plants' portraits", async ({ page }) => {
  const name = `Hero pilea ${Date.now()}`;
  await seedPlant(name);
  await loginAs(page, "Y");
  const hero = page.getByTestId("home-hero");
  await expect(hero.getByRole("heading", { level: 1, name: "How Not To Kill Your Plants" })).toBeVisible();
  await expect(hero.getByText(/^Good (morning|afternoon|evening), /)).toBeVisible();
  await expect(hero.getByTestId("hero-portrait").filter({ hasText: name })).toBeVisible();
  // The theme is green, not the default grayscale.
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  expect(primary.toLowerCase()).toBe("#4a7a5d");
});
