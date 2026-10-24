import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, home, species, taskCompletion, user } from "@/db/schema";
import { getTaskForUser } from "@/lib/access";
import { CareProfile } from "@/lib/ai/schemas";
import { nextDue, type ScheduleProfile } from "@/lib/care/schedule";
import type { TaskOutcome, TaskType } from "@/lib/care/types";
import { EMPTY_WATER_STATE, type WaterState } from "@/lib/care/watering";
import { todayIn } from "@/lib/time";

export type CompleteResult =
  | { status: "ok"; nextDueOn: string | null }
  | { status: "already_done"; by: { name: string }; at: Date };

const ALLOWED_OUTCOMES: Record<TaskType, readonly TaskOutcome[]> = {
  water: ["done", "still_moist", "skipped"],
  settle_check: ["rootbound_yes", "rootbound_no"],
  repot: ["done", "skipped"],
  fertilize: ["done", "skipped"],
  rotate: ["done", "skipped"],
  dust: ["done", "skipped"],
  mist: ["done", "skipped"],
  photo: ["done", "skipped"],
};

export class InvalidOutcomeError extends Error {
  constructor(
    readonly taskType: TaskType,
    readonly outcome: TaskOutcome,
  ) {
    super(`Outcome "${outcome}" is not valid for a ${taskType} task`);
    this.name = "InvalidOutcomeError";
  }
}

/** Used when the plant's species has no ready care profile yet. */
export const FALLBACK_PROFILE: ScheduleProfile = {
  waterIntervalDays: { growing: { min: 7, max: 10 }, dormant: { min: 10, max: 14 } },
  repotEveryMonths: 18,
  fertilizeEveryDays: 30,
  rotateEveryDays: 7,
  dustEveryDays: 30,
  mistEveryDays: null,
};

function scheduleProfileOf(raw: Record<string, unknown> | null | undefined): ScheduleProfile {
  const parsed = CareProfile.safeParse(raw);
  return parsed.success ? parsed.data : FALLBACK_PROFILE;
}

type Executor = Pick<typeof db, "select">;

/** The loser's lookup: who completed this task most recently, and when. */
async function latestCompletion(
  executor: Executor,
  taskId: string,
): Promise<{ name: string; at: Date } | undefined> {
  const [row] = await executor
    .select({ name: user.name, at: taskCompletion.completedAt })
    .from(taskCompletion)
    .innerJoin(user, eq(taskCompletion.userId, user.id))
    .where(eq(taskCompletion.taskId, taskId))
    .orderBy(desc(taskCompletion.completedAt))
    .limit(1);
  return row;
}

/** already_done result; with no completion on record, an empty name and now. */
function alreadyDone(last: { name: string; at: Date } | undefined): CompleteResult {
  return { status: "already_done", by: { name: last?.name ?? "" }, at: last?.at ?? new Date() };
}

/**
 * Complete a task, race-safely. Whoever wins the conditional version UPDATE
 * records the completion; everyone else gets `already_done` with the winner.
 *
 * - Access is checked first (non-members get Next's notFound, nothing written).
 * - A mismatched outcome throws InvalidOutcomeError before any write.
 * - An inactive task (e.g. a settle_check already answered) is never written;
 *   it returns already_done with the latest completion, or, if none exists,
 *   an empty name and the current time.
 * - On a lost race the winner's completion is read after the UPDATE returned 0
 *   rows. The UPDATE blocks on the winner's row lock (READ COMMITTED), so the
 *   winner has committed by then. If no completion is found (version mismatch
 *   for another reason), already_done is returned with an empty name and now.
 * - `skipped` for repot/fertilize reschedules like `done` would, except repot
 *   skipped asks again at the next spring day; neither teaches anything.
 */
export async function completeTask(input: {
  userId: string;
  taskId: string;
  expectedVersion: number;
  outcome: TaskOutcome;
}): Promise<CompleteResult> {
  const { userId, taskId, expectedVersion, outcome } = input;

  const task = await getTaskForUser(userId, taskId);
  if (!ALLOWED_OUTCOMES[task.type].includes(outcome)) {
    throw new InvalidOutcomeError(task.type, outcome);
  }

  if (!task.active) {
    return alreadyDone(await latestCompletion(db, task.id));
  }

  const [homeRow] = await db.select().from(home).limit(1);
  const hemisphere = homeRow?.hemisphere ?? "N";
  const today = todayIn(homeRow?.timezone ?? "Europe/Madrid");
  const [sp] = task.plant.speciesId
    ? await db.select().from(species).where(eq(species.id, task.plant.speciesId))
    : [];

  const storedState = task.state as Partial<WaterState>;
  const next = nextDue({
    type: task.type,
    outcome,
    today,
    profile: scheduleProfileOf(sp?.careProfile),
    hemisphere,
    state: task.type === "water" ? { ...EMPTY_WATER_STATE, ...storedState } : undefined,
    overrideDays: task.plant.waterIntervalOverrideDays,
  });

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(careTask)
      .set({
        dueOn: next.dueOn ?? task.dueOn,
        state: next.state ?? task.state,
        active: next.dueOn !== null,
        version: sql`${careTask.version} + 1`,
      })
      .where(
        and(
          eq(careTask.id, task.id),
          eq(careTask.version, expectedVersion),
          eq(careTask.active, true),
        ),
      )
      .returning({ id: careTask.id });

    if (!updated) {
      return alreadyDone(await latestCompletion(tx, task.id));
    }

    await tx.insert(taskCompletion).values({
      taskId: task.id,
      plantId: task.plantId,
      type: task.type,
      userId,
      outcome,
    });

    if (next.spawn) {
      await tx
        .insert(careTask)
        .values({ plantId: task.plantId, type: next.spawn.type, dueOn: next.spawn.dueOn })
        .onConflictDoUpdate({
          target: [careTask.plantId, careTask.type],
          set: { dueOn: next.spawn.dueOn, active: true },
        });
    }

    return { status: "ok", nextDueOn: next.dueOn };
  });
}
