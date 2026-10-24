import webpush from "web-push";
import { env } from "@/lib/env";

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string };
export type SendPush = (sub: PushSub, payload: PushPayload) => Promise<"sent" | "gone">;

let configured = false;

/**
 * Sends one Web Push message. A 404/410 from the push service means the
 * subscription is dead: returns "gone" so the caller can delete it. Any other
 * failure throws.
 */
export const sendPush: SendPush = async (sub, payload) => {
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60 },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw error;
  }
};
