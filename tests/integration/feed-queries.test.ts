import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, feedEvent, feedText, group, groupMember, home, moment, plant, user } from "@/db/schema";
import { currentMoods, feedForUser } from "@/lib/feed/queries";
import type { PostPayload } from "@/lib/feed/types";
import { db, resetDb } from "./setup";

describe("feedForUser", () => {
  const [Y, A, M] = ["u-y", "u-a", "u-m"];
  let ya: string, mg: string, all: string;
  let yaPlant: string, mPlant: string, allPlant: string, deadPlant: string;

  const first = (userName: string): PostPayload => ({ type: "first", mood: "happy", userName });
  const addEvent = async (plantId: string, hoursAgo = 1) =>
    (
      await db
        .insert(feedEvent)
        .values({ plantId, type: "first", payload: first("Yann"), createdAt: new Date(Date.now() - hoursAgo * 3600_000) })
        .returning({ id: feedEvent.id })
    )[0].id;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: A, name: "Adriana", email: "a@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    [{ id: ya }, { id: mg }, { id: all }] = await db
      .insert(group)
      .values([{ name: "YA" }, { name: "M" }, { name: "Everyone" }])
      .returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya, userId: Y }, { groupId: ya, userId: A },
      { groupId: mg, userId: M },
      { groupId: all, userId: Y }, { groupId: all, userId: A }, { groupId: all, userId: M },
    ]);
    const mk = async (groupId: string, name: string, status: "alive" | "dead" = "alive") =>
      (await db.insert(plant).values({ groupId, name, status, acquiredOn: "2026-10-01" }).returning({ id: plant.id }))[0].id;
    yaPlant = await mk(ya, "Pilea");
    mPlant = await mk(mg, "Monstera");
    allPlant = await mk(all, "Strelitzia");
    deadPlant = await mk(ya, "Ghost", "dead");
    for (const p of [yaPlant, mPlant, allPlant, deadPlant]) await addEvent(p);
  });

  const names = (posts: { plant: { name: string } }[]) => posts.map((p) => p.plant.name).sort();

  it("shows each person only the news of plants in their groups, never dead plants", async () => {
    expect(names(await feedForUser(M, "en", { mode: "all" }))).toEqual(["Monstera", "Strelitzia"]);
    expect(names(await feedForUser(Y, "en", { mode: "all" }))).toEqual(["Pilea", "Strelitzia"]);
  });

  it("follows the plant when it moves to another group, old posts included", async () => {
    await db.update(plant).set({ groupId: mg }).where(eq(plant.id, yaPlant));
    expect(names(await feedForUser(M, "en", { mode: "all" }))).toContain("Pilea");
    expect(names(await feedForUser(Y, "en", { mode: "all" }))).not.toContain("Pilea");
  });

  it("uses the stored text in the reader's language, else the template", async () => {
    const [ev] = await db.select().from(feedEvent).where(eq(feedEvent.plantId, mPlant));
    await db.insert(feedText).values({ eventId: ev.id, locale: "fr", text: "Bonjour, je suis Monstera 🌿" });

    const fr = (await feedForUser(M, "fr", { mode: "all" })).find((p) => p.plant.name === "Monstera")!;
    expect(fr.text).toBe("Bonjour, je suis Monstera 🌿");
    const en = (await feedForUser(M, "en", { mode: "all" })).find((p) => p.plant.name === "Monstera")!;
    expect(en.text).toContain("🌿");
    expect(en.text).not.toBe(fr.text);
    expect(en.mood).toBe("happy");
  });

  it("pages the full list with `before` without overlap", async () => {
    for (let h = 2; h < 6; h++) await addEvent(allPlant, h);
    const page1 = await feedForUser(M, "en", { mode: "all", limit: 3 });
    const page2 = await feedForUser(M, "en", { mode: "all", limit: 3, before: page1[2].createdAt });
    expect(page1).toHaveLength(3);
    expect(page2.length).toBeGreaterThan(0);
    expect(page2.some((p) => page1.some((q) => q.id === p.id))).toBe(false);
  });

  it("returns highlights through the highlight rules", async () => {
    const posts = await feedForUser(Y, "en", { mode: "highlights" });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(5);
  });

  it("computes current moods for several plants at once", async () => {
    await db.insert(careTask).values({ plantId: yaPlant, type: "water", dueOn: "2026-11-01" });
    await db.insert(moment).values({ plantId: mPlant, userId: M, type: "new_leaf", createdAt: new Date("2026-11-09T10:00:00Z") });
    const moods = await currentMoods([yaPlant, mPlant, allPlant], "2026-11-10");
    expect(moods.get(yaPlant)).toBe("sulking");
    expect(moods.get(mPlant)).toBe("proud");
    expect(moods.get(allPlant)).toBe("sleepy");
  });
});
