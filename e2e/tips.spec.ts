import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, USERS } from "./seed-data";

test("a delivered season tip shows in Plant news and on the Tips page", async ({ page }) => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [u] = await sql`select id from "user" where email = ${USERS.Y.email}`;
    const [t] = await sql`
      insert into tip (kind, trigger_key, params) values ('season', ${"season:e2e-" + Date.now()}, ${sql.json({ growing: "true" })})
      returning id`;
    await sql`insert into tip_recipient (tip_id, user_id, shown_at) values (${t.id}, ${u.id}, now())`;
  } finally {
    await sql.end();
  }

  await loginAs(page, "Y");
  // Other specs leave big plant moments in the shared e2e database, which rank above tips in the
  // home highlights by design, so check the full Plant news list.
  await page.goto("/news");
  await expect(page.getByTestId("feed-post").filter({ hasText: "Growing season" }).first()).toBeVisible();
  await page.goto("/tips");
  await expect(page.getByRole("heading", { name: "Your home" })).toBeVisible();
  await expect(page.getByText("Growing season").first()).toBeVisible();
});
