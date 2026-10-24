import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { careTask, group, groupMember, home, plant, pushSubscription, user } from "@/db/schema";
import { runDigests } from "@/lib/push/digest";
import { setLocale } from "@/lib/settings";
import { db, resetDb } from "./setup";

const send = vi.fn();
const deps = { send };

async function seed(opts: { due?: boolean } = {}) {
  await db.insert(home).values({});
  await db.insert(user).values({ id: "y", name: "Y", email: "y@example.com", pushTime: "08:30" });
  const [g] = await db.insert(group).values({ name: "G" }).returning({ id: group.id });
  await db.insert(groupMember).values({ groupId: g.id, userId: "y" });
  await db.insert(pushSubscription).values({ userId: "y", endpoint: "https://push.test/1", p256dh: "k", auth: "a" });
  const plants = await db
    .insert(plant)
    .values([
      { groupId: g.id, name: "Fern", acquiredOn: "2026-10-01" },
      { groupId: g.id, name: "Ficus", acquiredOn: "2026-10-01" },
    ])
    .returning({ id: plant.id });
  await db.insert(careTask).values([
    { plantId: plants[0].id, type: "water", dueOn: opts.due === false ? "2030-01-01" : "2026-11-05" },
    { plantId: plants[1].id, type: "water", dueOn: opts.due === false ? "2030-01-01" : "2026-11-03" },
  ]);
}

beforeEach(async () => {
  await resetDb();
  send.mockReset();
  send.mockResolvedValue("sent");
});

describe("runDigests", () => {
  it("waits for the user's push time, sends once a day", async () => {
    await seed();
    expect(await runDigests(new Date("2026-11-05T07:00:00Z"), deps)).toEqual({ sent: 0 }); // 08:00 Madrid
    expect(await runDigests(new Date("2026-11-05T07:45:00Z"), deps)).toEqual({ sent: 1 }); // 08:45
    expect(await runDigests(new Date("2026-11-05T08:00:00Z"), deps)).toEqual({ sent: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [u] = await db.select().from(user).where(eq(user.id, "y"));
    expect(u.lastDigestOn).toBe("2026-11-05");
  });

  it("builds a localized title, plant names and the overdue count", async () => {
    await seed();
    await runDigests(new Date("2026-11-05T07:45:00Z"), deps);
    const payload = send.mock.calls[0][1];
    expect(payload.title).toBe("🌿 2 plants need you today");
    expect(payload.body).toBe("Ficus, Fern · 1 task overdue");
    expect(payload.url).toBe("/");
  });

  it("uses the user's locale", async () => {
    await seed();
    await setLocale("y", "fr");
    await runDigests(new Date("2026-11-05T07:45:00Z"), deps);
    expect(send.mock.calls[0][1].title).toBe("🌿 2 plantes ont besoin de vous aujourd'hui");
  });

  it("sends nothing when no tasks are due", async () => {
    await seed({ due: false });
    expect(await runDigests(new Date("2026-11-05T07:45:00Z"), deps)).toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips users without subscriptions", async () => {
    await seed();
    await db.delete(pushSubscription);
    expect(await runDigests(new Date("2026-11-05T07:45:00Z"), deps)).toEqual({ sent: 0 });
  });

  it("deletes gone subscriptions and still marks the day done", async () => {
    await seed();
    send.mockResolvedValue("gone");
    expect(await runDigests(new Date("2026-11-05T07:45:00Z"), deps)).toEqual({ sent: 0 });
    expect(await db.select().from(pushSubscription)).toHaveLength(0);
    const [u] = await db.select().from(user).where(eq(user.id, "y"));
    expect(u.lastDigestOn).toBe("2026-11-05");
  });

  it("retries later when sending throws, and one user's failure does not stop others", async () => {
    await seed();
    await db.insert(user).values({ id: "z", name: "Z", email: "z@example.com" });
    const [g] = await db.select().from(group);
    await db.insert(groupMember).values({ groupId: g.id, userId: "z" });
    await db.insert(pushSubscription).values({ userId: "z", endpoint: "https://push.test/2", p256dh: "k", auth: "a" });
    send.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/1")) throw new Error("boom");
      return "sent";
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runDigests(new Date("2026-11-05T07:45:00Z"), deps)).toEqual({ sent: 1 });
    spy.mockRestore();
    const [y] = await db.select().from(user).where(eq(user.id, "y"));
    expect(y.lastDigestOn).toBeNull();
  });
});
