import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { pushSubscription, user } from "@/db/schema";
import { deletePushSubscription, upsertPushSubscription } from "@/lib/push/subscriptions";
import { db, resetDb } from "./setup";

const sub = { endpoint: "https://push.test/e1", p256dh: "k1", auth: "a1" };

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});

describe("push subscriptions", () => {
  it("re-subscribing an endpoint from another user reassigns it", async () => {
    await upsertPushSubscription("a", sub);
    await upsertPushSubscription("b", { ...sub, p256dh: "k2" });
    const rows = await db.select().from(pushSubscription);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("b");
    expect(rows[0].p256dh).toBe("k2");
  });

  it("delete is scoped to the caller", async () => {
    await upsertPushSubscription("a", sub);
    await deletePushSubscription("b", sub.endpoint);
    expect(await db.select().from(pushSubscription)).toHaveLength(1);
    await deletePushSubscription("a", sub.endpoint);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.userId, "a"))).toHaveLength(0);
  });
});
