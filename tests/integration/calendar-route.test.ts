import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/calendar/[token]/route";
import { calendarToken, careTask, group, groupMember, home, plant, user } from "@/db/schema";
import { getOrCreateCalendarToken, regenerateCalendarToken } from "@/lib/calendar/tokens";
import { setLocale, setPushTime } from "@/lib/settings";
import { db, resetDb } from "./setup";

const call = (token: string) =>
  GET(new Request(`http://localhost/api/calendar/${token}`), {
    params: Promise.resolve({ token }),
  });

describe("calendar feed", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com" });
    const [g] = await db.insert(group).values({ name: "G" }).returning({ id: group.id });
    await db.insert(groupMember).values({ groupId: g.id, userId: "u1" });
    const rows = await db
      .insert(plant)
      .values([
        { groupId: g.id, name: "Alive", acquiredOn: "2026-10-01" },
        { groupId: g.id, name: "Ghost", acquiredOn: "2026-10-01", status: "dead" },
      ])
      .returning({ id: plant.id, name: plant.name });
    await db.insert(careTask).values(
      rows.map((r) => ({ plantId: r.id, type: "water" as const, dueOn: "2020-01-01" })),
    );
  });

  it("404s for an unknown token", async () => {
    expect((await call("nope")).status).toBe(404);
  });

  it("serves a no-store text/calendar feed without dead plants", async () => {
    const token = await getOrCreateCalendarToken("u1");
    expect(await getOrCreateCalendarToken("u1")).toBe(token);
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/calendar/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("Alive");
    expect(body).not.toContain("Ghost");
  });

  it("uses the token owner's locale", async () => {
    await setLocale("u1", "fr");
    const body = await (await call(await getOrCreateCalendarToken("u1"))).text();
    expect(body).toContain("Arroser Alive");
  });

  it("regenerating invalidates the old token", async () => {
    const old = await getOrCreateCalendarToken("u1");
    const fresh = await regenerateCalendarToken("u1");
    expect(fresh).not.toBe(old);
    expect((await call(old)).status).toBe(404);
    expect((await call(fresh)).status).toBe(200);
    expect(await db.select().from(calendarToken).where(eq(calendarToken.userId, "u1"))).toHaveLength(1);
  });
});

describe("settings", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com" });
  });

  it("validates push time and locale", async () => {
    await setPushTime("u1", "07:05");
    await expect(setPushTime("u1", "24:00")).rejects.toThrow();
    await expect(setPushTime("u1", "8:30")).rejects.toThrow();
    await expect(setLocale("u1", "de" as never)).rejects.toThrow();
    await setLocale("u1", "pt-BR");
    const [u] = await db.select().from(user).where(eq(user.id, "u1"));
    expect(u.pushTime).toBe("07:05");
    expect(u.locale).toBe("pt-BR");
  });
});
