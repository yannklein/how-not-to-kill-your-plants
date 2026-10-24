import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import type { PushSub } from "./send";

/** Upsert on endpoint; an endpoint re-subscribed by another user is reassigned to them. */
export async function upsertPushSubscription(userId: string, sub: PushSub): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
}

/** Removes the caller's own subscription for the endpoint; others' are untouched. */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)));
}
