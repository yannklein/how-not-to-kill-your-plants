import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Subscribe = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const Unsubscribe = z.object({ endpoint: z.url() });

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
const invalid = () => Response.json({ error: "invalid body" }, { status: 400 });

async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  const parsed = Subscribe.safeParse(await body(req));
  if (!parsed.success) return invalid();
  const { endpoint, keys } = parsed.data;
  await db
    .insert(pushSubscription)
    .values({ userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  const parsed = Unsubscribe.safeParse(await body(req));
  if (!parsed.success) return invalid();
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, parsed.data.endpoint), eq(pushSubscription.userId, me.id)));
  return Response.json({ ok: true });
}
