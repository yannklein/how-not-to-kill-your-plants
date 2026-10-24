"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import type { TaskOutcome } from "@/lib/care/types";
import { runFeedTextFill } from "@/lib/feed/cron";
import { requireUser } from "@/lib/session";
import { completeTask, InvalidOutcomeError } from "@/lib/tasks/complete";

export type CompleteActionResult =
  | { status: "ok" }
  | { status: "already_done"; message: string }
  | { status: "error"; message: string };

export async function completeTaskAction(
  taskId: string,
  expectedVersion: number,
  outcome: TaskOutcome,
): Promise<CompleteActionResult> {
  const user = await requireUser();
  const t = await getTranslations();
  try {
    const result = await completeTask({ userId: user.id, taskId, expectedVersion, outcome });
    revalidatePath("/");
    if (result.status === "ok") {
      after(() => runFeedTextFill().catch((err) => console.error("feed text fill failed", err)));
      return { status: "ok" };
    }
    const name = result.by.name.trim();
    return {
      status: "already_done",
      message: name ? t("tasks.alreadyDoneBy", { name }) : t("tasks.alreadyDone"),
    };
  } catch (error) {
    if (error instanceof InvalidOutcomeError) return { status: "error", message: t("common.error") };
    throw error;
  }
}
