import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { todayIn } from "@/lib/time";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS } from "./seed-data";

async function seedPlant(name: string, photoDueToday = false): Promise<string> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.YA}`;
    const [h] = await sql`select timezone from home limit 1`;
    const today = todayIn(h.timezone);
    const [p] = await sql`insert into plant (group_id, name, acquired_on) values (${g.id}, ${name}, ${today}) returning id`;
    if (photoDueToday) await sql`insert into care_task (plant_id, type, due_on) values (${p.id}, 'photo', ${today})`;
    return p.id;
  } finally {
    await sql.end();
  }
}

test("ask the gardener about a plant and accept its watering advice", async ({ page }) => {
  const name = `Fern ${Date.now()}`;
  const plantId = await seedPlant(name);
  await loginAs(page, "Y");
  await page.goto(`/plants/${plantId}`);
  await page.getByRole("link", { name: "Ask the gardener" }).click();
  await expect(page).toHaveURL(/\/gardener/);

  await page.getByPlaceholder("Ask about your plants…").fill("Should I water more?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("chat-message").filter({ hasText: "[mock]" })).toHaveCount(1);

  await page.getByRole("button", { name: "Water every 10 days" }).click();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible();

  await page.goto(`/plants/${plantId}/edit`);
  await expect(page.locator("#waterIntervalOverrideDays")).toHaveValue("10");
});

test("a photo of a struggling plant brings a warning card that Done clears", async ({ page }) => {
  const name = `Sick fern ${Date.now()}`;
  await seedPlant(name, true);
  await loginAs(page, "Y");

  const task = page.getByTestId("task-card").filter({ hasText: name });
  await task.getByTestId("photo-input").setInputFiles(path.resolve(__dirname, "fixtures/pilea.jpg"));
  await task.getByRole("button", { name: "Nothing new" }).click();
  await expect(page.getByTestId("task-card").filter({ hasText: name })).toHaveCount(0);

  const card = page.getByTestId("alert-card").filter({ hasText: name });
  await expect
    .poll(
      async () => {
        await page.reload();
        return card.count();
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  await card.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("alert-card").filter({ hasText: name })).toHaveCount(0);
});
