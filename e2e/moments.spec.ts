import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS } from "./seed-data";

async function seedPlant(plantName: string): Promise<string> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.YA}`;
    const [p] = await sql`
      insert into plant (group_id, name, acquired_on) values (${g.id}, ${plantName}, '2026-10-01')
      returning id`;
    return p.id;
  } finally {
    await sql.end();
  }
}

test("a flower logged by mistake can be undone by its author only", async ({ browser }) => {
  const plantName = `Blooming pilea ${Date.now()}`;
  const plantId = await seedPlant(plantName);

  const ctxY = await browser.newContext();
  const y = await ctxY.newPage();
  await loginAs(y, "Y");
  await y.goto(`/plants/${plantId}`);
  await y.getByRole("button", { name: /Something new/ }).click();
  await y.getByRole("button", { name: "Flower" }).click();
  await expect(y.getByTestId("moment").filter({ hasText: "Flower" })).toHaveCount(1);

  await y.goto("/");
  await expect(y.getByTestId("feed-post").filter({ hasText: plantName })).toHaveCount(1);

  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await loginAs(a, "A");
  await a.goto(`/plants/${plantId}`);
  await expect(a.getByTestId("moment")).toHaveCount(1);
  await expect(a.getByTestId("moment").getByRole("button", { name: "Delete" })).toHaveCount(0);

  await y.goto(`/plants/${plantId}`);
  await y.getByTestId("moment").getByRole("button", { name: "Delete" }).click();
  await expect(y.getByTestId("moment")).toHaveCount(0);
  await y.goto("/");
  await expect(y.getByTestId("feed-post").filter({ hasText: plantName })).toHaveCount(0);

  await ctxY.close();
  await ctxA.close();
});
