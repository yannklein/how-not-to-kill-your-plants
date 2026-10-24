import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/db/client";
import { home } from "@/db/schema";
import {
  backfillPhotoTasks,
  runBirthdays,
  runFeedTextFill,
  runMoodChanges,
  runSeasonChanges,
} from "@/lib/feed/cron";
import { runPatternChecks, runPhotoChecks } from "@/lib/gardener/checks";
import { runCareProfileRetries, runDigests } from "@/lib/push/digest";
import { todayIn } from "@/lib/time";

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
  const now = new Date();
  const [h] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  const today = todayIn(h?.timezone ?? "Europe/Madrid", now);

  // Each step on its own: one failing never stops the others (or the morning digest).
  const profilesReady = await step("care profiles", runCareProfileRetries);
  const photoTasks = await step("photo tasks", backfillPhotoTasks);
  const birthdays = await step("birthdays", () => runBirthdays(today));
  const moodPosts = await step("moods", () => runMoodChanges(today));
  const seasonPosts = await step("seasons", () => runSeasonChanges(today));
  const digestsSent = await step("digests", async () => (await runDigests(now)).sent);
  // Optional AI work last, so a slow model never delays the morning push.
  const photoChecks = await step("photo checks", () => runPhotoChecks());
  const patternAlerts = await step("pattern checks", () => runPatternChecks(today));
  const textsWritten = await step("feed texts", () => runFeedTextFill());
  return Response.json({
    profilesReady,
    photoTasks,
    birthdays,
    moodPosts,
    seasonPosts,
    digestsSent,
    photoChecks,
    patternAlerts,
    textsWritten,
  });
}

async function step(name: string, run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (error) {
    console.error(`cron tick: ${name} failed`, error);
    return 0;
  }
}
