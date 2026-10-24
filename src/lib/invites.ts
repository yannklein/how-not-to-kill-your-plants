import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { group, groupMember, invite, user } from "@/db/schema";
import { auth } from "@/lib/auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteErrorCode = "expired" | "used" | "not_found";

export class InviteError extends Error {
  constructor(public readonly code: InviteErrorCode) {
    super(`Invite ${code}`);
    this.name = "InviteError";
  }
}

export type InviteInputField = "name" | "password";

export class InviteInputError extends Error {
  constructor(
    public readonly field: InviteInputField,
    message: string,
  ) {
    super(message);
    this.name = "InviteInputError";
  }
}

export async function createInvite(
  adminId: string,
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(invite).values({ token, createdBy: adminId, expiresAt });
  return { token, url: `${process.env.APP_URL}/invite/${token}`, expiresAt };
}

export async function acceptInvite(
  token: string,
  input: { name: string; email: string; password: string },
): Promise<{ userId: string }> {
  const name = input.name.trim();
  if (!name) throw new InviteInputError("name", "Name is required");
  const { minPasswordLength, maxPasswordLength } = (await auth.$context).password.config;
  if (input.password.length < minPasswordLength) {
    throw new InviteInputError(
      "password",
      `Password must be at least ${minPasswordLength} characters`,
    );
  }
  if (input.password.length > maxPasswordLength) {
    throw new InviteInputError("password", "Password is too long");
  }

  // Atomically claim the invite: only one concurrent caller can flip used_at.
  const [claimed] = await db
    .update(invite)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(invite.token, token),
        isNull(invite.usedAt),
        gt(invite.expiresAt, new Date()),
      ),
    )
    .returning({ id: invite.id });

  if (!claimed) {
    const [existing] = await db
      .select({ usedAt: invite.usedAt })
      .from(invite)
      .where(eq(invite.token, token));
    if (!existing) throw new InviteError("not_found");
    throw new InviteError(existing.usedAt ? "used" : "expired");
  }

  try {
    const { user: created } = await auth.api.createUser({
      body: {
        name,
        email: input.email,
        password: input.password,
        role: "user",
      },
    });
    const [everyone] = await db
      .select({ id: group.id })
      .from(group)
      .where(eq(group.name, "Everyone"));
    if (everyone) {
      await db
        .insert(groupMember)
        .values({ groupId: everyone.id, userId: created.id })
        .onConflictDoNothing();
    }
    await db
      .update(invite)
      .set({ usedBy: created.id })
      .where(eq(invite.id, claimed.id));
    return { userId: created.id };
  } catch (err) {
    // Release the claim so the invitee can retry (e.g. email already taken).
    await db.update(invite).set({ usedAt: null }).where(eq(invite.id, claimed.id));
    throw err;
  }
}

// Better Auth's admin `setUserPassword` endpoint needs a request session, so
// server-side we use the same primitives it uses (password hasher + internal
// adapter) after checking the caller is an admin.
export async function resetPassword(
  adminId: string,
  userId: string,
  newPassword: string,
): Promise<void> {
  const [caller] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, adminId));
  if (caller?.role !== "admin") throw new Error("Only admins can reset passwords");

  const ctx = await auth.$context;
  if (newPassword.length < ctx.password.config.minPasswordLength) {
    throw new Error("Password too short");
  }
  const target = await ctx.internalAdapter.findUserById(userId);
  if (!target) throw new Error("User not found");

  const hash = await ctx.password.hash(newPassword);
  if (await ctx.internalAdapter.findCredentialAccount(userId)) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(userId);
}
