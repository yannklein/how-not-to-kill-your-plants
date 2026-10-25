import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./helpers";
import { E2E_DATABASE_URL, GROUPS, USERS } from "./seed-data";

// Longer French and Portuguese labels must still fit an iPhone-width screen.
async function withLocale<T>(locale: string, run: () => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`update "user" set locale = ${locale} where email = ${USERS.A.email}`;
    return await run();
  } finally {
    await sql`update "user" set locale = 'en' where email = ${USERS.A.email}`;
    await sql.end();
  }
}

async function plantId(): Promise<string> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [g] = await sql`select id from "group" where name = ${GROUPS.YA}`;
    const [p] = await sql`insert into plant (group_id, name, acquired_on) values (${g.id}, ${"Layout " + Date.now()}, '2026-10-01') returning id`;
    return p.id;
  } finally {
    await sql.end();
  }
}

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const locale of ["fr", "pt-BR"]) {
  test(`home and plant pages fit the phone screen in ${locale}`, async ({ page }) => {
    const id = await plantId();
    await withLocale(locale, async () => {
      await loginAs(page, "A");
      expect(await overflows(page)).toBe(false);
      await page.goto(`/plants/${id}`);
      expect(await overflows(page)).toBe(false);
    });
  });
}
