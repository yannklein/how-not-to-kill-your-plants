"use server";

import { acceptInvite, InviteError, InviteInputError } from "@/lib/invites";

export type AcceptInviteError = InviteError["code"] | "invalid" | "generic";
export type AcceptInviteResult = { ok: true } | { ok: false; error: AcceptInviteError };

export async function acceptInviteAction(
  token: string,
  input: { name: string; email: string; password: string },
): Promise<AcceptInviteResult> {
  try {
    await acceptInvite(token, input);
    return { ok: true };
  } catch (err) {
    if (err instanceof InviteInputError) return { ok: false, error: "invalid" };
    if (err instanceof InviteError) return { ok: false, error: err.code };
    return { ok: false, error: "generic" };
  }
}
