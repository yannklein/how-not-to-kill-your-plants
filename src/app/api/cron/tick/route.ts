import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runCareProfileRetries, runDigests } from "@/lib/push/digest";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  // Hash first so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const profilesReady = await runCareProfileRetries();
  const { sent } = await runDigests(new Date());
  return Response.json({ profilesReady, digestsSent: sent });
}
