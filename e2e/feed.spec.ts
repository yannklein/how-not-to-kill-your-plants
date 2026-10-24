import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { todayIn } from "@/lib/time";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS } from "./seed-data";

// Seeds a Yann + Adriana plant whose monthly portrait is due today.
async function seedPhotoTask(plantName: string): Promise<void> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.YA}`;
    const [h] = await sql`select timezone from home limit 1`;
    const today = todayIn(h.timezone);
    const [p] = await sql`
      insert into plant (group_id, name, acquired_on) values (${g.id}, ${plantName}, ${today})
      returning id`;
    await sql`insert into care_task (plant_id, type, due_on) values (${p.id}, 'photo', ${today})`;
  } finally {
    await sql.end();
  }
}

test("a portrait with a new leaf makes one news post, visible only to the plant's group", async ({ browser }) => {
  const plantName = `Portrait fern ${Date.now()}`;
  await seedPhotoTask(plantName);

  const ctxY = await browser.newContext();
  const y = await ctxY.newPage();
  await loginAs(y, "Y");
  const card = y.getByTestId("task-card").filter({ hasText: plantName });
  await expect(card).toBeVisible();

  await card.getByTestId("photo-input").setInputFiles(path.resolve(__dirname, "fixtures/pilea.jpg"));
  await card.getByRole("button", { name: "New leaf" }).click();

  await expect(y.getByTestId("task-card").filter({ hasText: plantName })).toHaveCount(0);
  const posts = y.getByTestId("feed-post").filter({ hasText: plantName });
  await expect(posts).toHaveCount(1);
  await expect(posts.locator("img[data-post-photo]")).toHaveCount(1);

  await y.getByRole("link", { name: "See all" }).click();
  await expect(y).toHaveURL(/\/news$/);
  await expect(y.getByTestId("feed-post").filter({ hasText: plantName })).toHaveCount(1);

  const ctxM = await browser.newContext();
  const m = await ctxM.newPage();
  await loginAs(m, "M");
  await m.goto("/news");
  await expect(m.getByTestId("feed-post").filter({ hasText: plantName })).toHaveCount(0);

  await ctxY.close();
  await ctxM.close();
});
