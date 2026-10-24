"use server";

import { acceptInvite, InviteError } from "@/lib/invites";

export type AcceptInviteResult = { ok: true } | { ok: false; error: string };

const MESSAGES: Record<InviteError["code"], string> = {
  expired: "This invite has expired. Ask for a new one.",
  used: "This invite has already been used.",
  not_found: "This invite link is not valid.",
};

export async function acceptInviteAction(
  token: string,
  input: { name: string; email: string; password: string },
): Promise<AcceptInviteResult> {
  try {
    await acceptInvite(token, input);
    return { ok: true };
  } catch (err) {
    if (err instanceof InviteError) return { ok: false, error: MESSAGES[err.code] };
    return { ok: false, error: "Could not create the account. Check your details." };
  }
}
