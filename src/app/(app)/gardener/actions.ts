"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { applyAlertSuggestion, resolveAlert } from "@/lib/gardener/alerts";
import { checkChatPhoto } from "@/lib/gardener/checks";
import { acceptChatSuggestion, seedAlertMessage, sendMessage } from "@/lib/gardener/chat";
import { requireUser } from "@/lib/session";

export async function sendMessageAction(threadId: string, text: string, photoKey?: string) {
  const user = await requireUser();
  const result = await sendMessage(user.id, threadId, { text, photoKey });
  if (result.status === "ok" && result.plantId && photoKey) {
    const plantId = result.plantId;
    after(() => checkChatPhoto(plantId, photoKey).catch((err) => console.error("chat photo check failed", err)));
  }
  revalidatePath("/gardener");
  return { status: result.status };
}

/** Applies a chat suggestion; returns a message to show when it couldn't be applied. */
export async function acceptSuggestionAction(messageId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const t = await getTranslations("gardener");
  const result = await acceptChatSuggestion(user.id, messageId);
  revalidatePath("/gardener");
  revalidatePath("/");
  return result === "applied" ? { ok: true } : { ok: false, message: t(result) };
}

export async function resolveAlertAction(alertId: string, status: "done" | "dismissed") {
  const user = await requireUser();
  await resolveAlert(user.id, alertId, status);
  revalidatePath("/");
}

export async function applyAlertSuggestionAction(alertId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const t = await getTranslations("gardener");
  const result = await applyAlertSuggestion(user.id, alertId);
  revalidatePath("/");
  return result === "applied" ? { ok: true } : { ok: false, message: t(result) };
}

/** "Ask the gardener" on a warning: open this user's conversation about the plant, with the warning in it. */
export async function askAboutAlertAction(alertId: string) {
  const user = await requireUser();
  const { threadId } = await seedAlertMessage(user.id, alertId);
  redirect(`/gardener?thread=${threadId}`);
}
