import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { todayIn } from "@/lib/time";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS } from "./seed-data";

// Seeds a plant in "Everyone" with a water task due today, directly in the e2e database.
async function seedWaterTask(plantName: string, secondTask = false): Promise<void> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.ALL}`;
    const [h] = await sql`select timezone from home limit 1`;
    const today = todayIn(h.timezone);
    const [p] = await sql`
      insert into plant (group_id, name, acquired_on) values (${g.id}, ${plantName}, ${today})
      returning id`;
    await sql`insert into care_task (plant_id, type, due_on) values (${p.id}, 'water', ${today})`;
    if (secondTask) {
      await sql`insert into care_task (plant_id, type, due_on) values (${p.id}, 'rotate', ${today})`;
    }
  } finally {
    await sql.end();
  }
}

test("first tick clears the task for everyone; a stale page sees who did it", async ({ browser }) => {
  const plantName = `Shared fern ${Date.now()}`;
  await seedWaterTask(plantName);

  const ctxY = await browser.newContext();
  const ctxA = await browser.newContext();
  try {
    const [yFresh, yStale, a] = [await ctxY.newPage(), await ctxY.newPage(), await ctxA.newPage()];
    await loginAs(yFresh, "Y");
    await yStale.goto("/");
    await loginAs(a, "A");

    const card = (page: typeof a) => page.getByTestId("task-card").filter({ hasText: plantName });
    await expect(card(yStale)).toBeVisible();
    await expect(card(a)).toBeVisible();

    await card(a).getByRole("button", { name: "Watered" }).click();
    await expect(card(a)).toHaveCount(0);

    await yFresh.reload();
    await expect(card(yFresh)).toHaveCount(0);

    // yStale still shows the old task with its old version.
    await expect(card(yStale)).toBeVisible();
    await card(yStale).getByRole("button", { name: "Watered" }).click();
    await expect(yStale.getByText("Already done by Adriana")).toBeVisible();
  } finally {
    await ctxY.close();
    await ctxA.close();
  }
});

test("a plant with several due tasks shows as one card with one row per task", async ({ page }) => {
  const plantName = `Grouped palm ${Date.now()}`;
  await seedWaterTask(plantName, true);
  await loginAs(page, "Y");

  const card = page.getByTestId("task-card").filter({ hasText: plantName });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("task-row")).toHaveCount(2);
  await expect(card.getByText(plantName)).toHaveCount(1);
});
