import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { group, groupMember, home, plant, tip, tipRecipient, user } from "@/db/schema";
import { feedForUser } from "@/lib/feed/queries";
import { tipsForUser } from "@/lib/tips/queries";
import { db, resetDb } from "./setup";

describe("tips in the feed and on the tips page", () => {
  const [Y, M] = ["u-y", "u-m"];
  let ya: string, mg: string, plantId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    [{ id: ya }, { id: mg }] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya, userId: Y },
      { groupId: mg, userId: M },
    ]);
    [{ id: plantId }] = await db.insert(plant).values({ groupId: ya, name: "Pilea", acquiredOn: "2026-10-01" }).returning({ id: plant.id });
  });

  async function showTip(kind: "season" | "repot", plantRef: string | null, userId: string, shownAt = new Date()) {
    const [t] = await db
      .insert(tip)
      .values({
        kind, plantId: plantRef, triggerKey: `${kind}:${Math.random()}`,
        params: kind === "season" ? { growing: "true" } : { plant: "Pilea", dueOn: "2026-11-23" },
      })
      .returning();
    await db.insert(tipRecipient).values({ tipId: t.id, userId, shownAt });
    return t.id;
  }

  it("shows a delivered tip in Plant news and on the tips page", async () => {
    const id = await showTip("repot", plantId, Y);
    const feed = await feedForUser(Y, "en", { mode: "all" });
    const post = feed.find((p) => p.id === id)!;
    expect(post).toMatchObject({ kind: "tip", plant: { name: "Pilea" } });
    expect(post.text).toContain("Pilea");
    expect((await tipsForUser(Y, "en")).map((t) => t.id)).toEqual([id]);
  });

  it("hides queued tips and tips of plants the user can no longer see", async () => {
    const queued = await db.insert(tip).values({ kind: "repot", plantId, triggerKey: "repot:q", params: { plant: "Pilea" } }).returning();
    await db.insert(tipRecipient).values({ tipId: queued[0].id, userId: Y });
    const id = await showTip("repot", plantId, Y);
    expect((await tipsForUser(Y, "en")).map((t) => t.id)).toEqual([id]);

    await db.update(plant).set({ groupId: mg }).where(eq(plant.id, plantId));
    expect(await tipsForUser(Y, "en")).toHaveLength(0);
    expect((await feedForUser(Y, "en", { mode: "all" })).some((p) => p.id === id)).toBe(false);
  });

  it("keeps home-wide tips for everyone they were shown to", async () => {
    const id = await showTip("season", null, M);
    const [t] = await tipsForUser(M, "fr");
    expect(t).toMatchObject({ id, plant: null });
    expect(t.text).toContain("💡");
    expect(await tipsForUser(Y, "en")).toHaveLength(0);
  });
});
