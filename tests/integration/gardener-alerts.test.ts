import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { gardenerAlert, group, groupMember, home, plant, user } from "@/db/schema";
import { applyAlertSuggestion, createAlert, openAlertsForUser, resolveAlert } from "@/lib/gardener/alerts";
import { db, resetDb } from "./setup";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const texts = { en: "Too dark here", fr: "Trop sombre ici", "pt-BR": "Muito escuro aqui" };

describe("gardener alerts", () => {
  const [Y, A, M] = ["u-y", "u-a", "u-m"];
  let plantId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: A, name: "Adriana", email: "a@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [ya, mg] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: Y },
      { groupId: ya.id, userId: A },
      { groupId: mg.id, userId: M },
    ]);
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: ya.id, name: "Ficus", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
  });

  const alert = (category: "light" | "overwatering" = "light") =>
    createAlert({ plantId, source: "photo", category, texts, suggestion: null });
  const open = () =>
    db.select().from(gardenerAlert).where(and(eq(gardenerAlert.plantId, plantId), eq(gardenerAlert.status, "open")));

  it("keeps only the newest open warning per plant", async () => {
    await alert("light");
    const newer = await alert("overwatering");
    const rows = await open();
    expect(rows.map((r) => r.id)).toEqual([newer]);
  });

  it("stays quiet about the same issue for 14 days after Done or Not now", async () => {
    const id = (await alert("light"))!;
    expect(await resolveAlert(Y, id, "dismissed")).toBe("ok");
    expect(await alert("light")).toBeNull();
    expect(await alert("overwatering")).not.toBeNull();

    await db.update(gardenerAlert).set({ resolvedAt: new Date(Date.now() - 15 * 24 * 3600_000) }).where(eq(gardenerAlert.id, id));
    expect(await alert("light")).not.toBeNull();
  });

  it("resolves once for the whole group, even from a stale tab", async () => {
    const id = (await alert())!;
    const results = await Promise.all([resolveAlert(Y, id, "done"), resolveAlert(A, id, "done")]);
    expect(results.sort()).toEqual(["already", "ok"]);
    expect(await resolveAlert(Y, id, "dismissed")).toBe("already");
    expect(await openAlertsForUser(A, "en")).toHaveLength(0);
  });

  it("is invisible and untouchable for people outside the plant's group", async () => {
    const id = (await alert())!;
    await expect(resolveAlert(M, id, "done")).rejects.toMatchObject(NOT_FOUND);
    expect(await openAlertsForUser(M, "en")).toHaveLength(0);
    expect(await open()).toHaveLength(1);
  });

  it("shows the warning in the reader's language", async () => {
    await alert();
    const [fr] = await openAlertsForUser(Y, "fr");
    expect(fr).toMatchObject({ plantName: "Ficus", text: "Trop sombre ici", category: "light" });
  });

  it("applies a warning's suggested change for anyone in the group", async () => {
    const id = (await createAlert({ plantId, source: "pattern", category: "overwatering", texts, suggestion: { kind: "water", days: 12 } }))!;
    expect(await applyAlertSuggestion(A, id)).toBe("applied");
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].waterIntervalOverrideDays).toBe(12);
    await expect(applyAlertSuggestion(M, id)).rejects.toMatchObject(NOT_FOUND);
  });
});
