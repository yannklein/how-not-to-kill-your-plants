"use server";

import { revalidatePath } from "next/cache";
import {
  deleteSpot as deleteSpotLib,
  saveHome as saveHomeLib,
  setAiCap as setAiCapLib,
  upsertGroup as upsertGroupLib,
  upsertSpot as upsertSpotLib,
  type HomeInput,
  type SpotInput,
} from "@/lib/admin";
import { createInvite, resetPassword } from "@/lib/invites";
import { requireAdmin } from "@/lib/session";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false };

const PATH = "/settings/admin";

// requireAdmin() stays outside the try block: it signals via redirect/notFound
// exceptions that must propagate.
async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath(PATH);
    return { ok: true, ...value };
  } catch {
    return { ok: false };
  }
}

export async function saveHome(input: HomeInput): Promise<ActionResult> {
  await requireAdmin();
  return run(() => saveHomeLib(input).then(() => ({})));
}

export async function upsertGroup(
  name: string,
  memberIds: string[],
  id?: string,
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => upsertGroupLib(name, memberIds, id).then(() => ({})));
}

export async function upsertSpot(input: SpotInput): Promise<ActionResult> {
  await requireAdmin();
  return run(() => upsertSpotLib(input).then(() => ({})));
}

export async function deleteSpot(id: string): Promise<ActionResult> {
  await requireAdmin();
  return run(() => deleteSpotLib(id).then(() => ({})));
}

export async function setAiCap(capUsd: number): Promise<ActionResult> {
  await requireAdmin();
  return run(() => setAiCapLib(capUsd).then(() => ({})));
}

export async function createInviteAction(): Promise<ActionResult<{ url: string }>> {
  const admin = await requireAdmin();
  return run(async () => ({ url: (await createInvite(admin.id)).url }));
}

export async function resetPasswordAction(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => resetPassword(admin.id, userId, newPassword).then(() => ({})));
}
