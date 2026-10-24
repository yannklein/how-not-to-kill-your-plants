import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { group, groupMember, invite, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { acceptInvite, createInvite, InviteError, InviteInputError, resetPassword } from "@/lib/invites";
import { db, resetDb } from "./setup";

async function makeAdmin() {
  const { user: admin } = await auth.api.createUser({
    body: { name: "Yann", email: "yann@example.com", password: "password-1234", role: "admin" },
  });
  return admin.id;
}

const person = { name: "Adriana", email: "adriana@example.com", password: "password-5678" };

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof InviteError) return e.code;
    throw e;
  }
  return null;
}

describe("invites", () => {
  let adminId: string;
  beforeEach(async () => {
    await resetDb();
    adminId = await makeAdmin();
  });

  it("creates a 7-day invite with a base64url token and url", async () => {
    const { token, url, expiresAt } = await createInvite(adminId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).toBe(`${process.env.APP_URL}/invite/${token}`);
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("accepts a valid token: creates a role=user user and marks the invite used", async () => {
    const { token } = await createInvite(adminId);
    const [everyone] = await db.insert(group).values({ name: "Everyone" }).returning();
    const { userId } = await acceptInvite(token, person);
    const members = await db
      .select()
      .from(groupMember)
      .where(eq(groupMember.groupId, everyone.id));
    expect(members.map((m) => m.userId)).toContain(userId);
    const [u] = await db.select().from(user).where(eq(user.id, userId));
    expect(u.role).toBe("user");
    expect(u.email).toBe(person.email);
    const [inv] = await db.select().from(invite).where(eq(invite.token, token));
    expect(inv.usedAt).not.toBeNull();
    expect(inv.usedBy).toBe(userId);
    const signedIn = await auth.api.signInEmail({
      body: { email: person.email, password: person.password },
    });
    expect(signedIn.user.id).toBe(userId);
  });

  it("rejects a second accept of the same token as used", async () => {
    const { token } = await createInvite(adminId);
    await acceptInvite(token, person);
    expect(
      await codeOf(acceptInvite(token, { ...person, email: "other@example.com" })),
    ).toBe("used");
  });

  it("rejects an expired token", async () => {
    const { token } = await createInvite(adminId);
    await db
      .update(invite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invite.token, token));
    expect(await codeOf(acceptInvite(token, person))).toBe("expired");
  });

  it("rejects an unknown token", async () => {
    expect(await codeOf(acceptInvite("nope", person))).toBe("not_found");
  });

  it("creates only one user when the same token is accepted concurrently", async () => {
    const { token } = await createInvite(adminId);
    const results = await Promise.allSettled([
      acceptInvite(token, { ...person, email: "a@example.com" }),
      acceptInvite(token, { ...person, email: "b@example.com" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const users = await db.select().from(user);
    expect(users).toHaveLength(2); // admin + one invitee
  });

  it("releases the invite when user creation fails (email taken)", async () => {
    const { token } = await createInvite(adminId);
    await expect(
      acceptInvite(token, { ...person, email: "yann@example.com" }),
    ).rejects.toThrow();
    await expect(acceptInvite(token, person)).resolves.toBeDefined();
  });

  it.each([
    ["empty password", { ...person, password: "" }],
    ["too short password", { ...person, password: "short" }],
    ["blank name", { ...person, name: "   " }],
  ])("rejects %s and leaves the invite unused", async (_label, input) => {
    const { token } = await createInvite(adminId);
    await expect(acceptInvite(token, input)).rejects.toBeInstanceOf(InviteInputError);
    const [inv] = await db.select().from(invite).where(eq(invite.token, token));
    expect(inv.usedAt).toBeNull();
    const users = await db.select().from(user);
    expect(users).toHaveLength(1);
  });

  it("rejects public sign-up", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Eve", email: "eve@example.com", password: "password-9999" },
      }),
    ).rejects.toThrow();
    const rows = await db.select().from(user).where(eq(user.email, "eve@example.com"));
    expect(rows).toHaveLength(0);
  });
});

describe("resetPassword", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lets an admin set a new password that works for sign-in", async () => {
    const adminId = await makeAdmin();
    const { token } = await createInvite(adminId);
    const { userId } = await acceptInvite(token, person);
    await resetPassword(adminId, userId, "brand-new-pass-1");
    await expect(
      auth.api.signInEmail({ body: { email: person.email, password: person.password } }),
    ).rejects.toThrow();
    const ok = await auth.api.signInEmail({
      body: { email: person.email, password: "brand-new-pass-1" },
    });
    expect(ok.user.id).toBe(userId);
  });

  it("refuses non-admin callers", async () => {
    const adminId = await makeAdmin();
    const { token } = await createInvite(adminId);
    const { userId } = await acceptInvite(token, person);
    await expect(resetPassword(userId, adminId, "hacked-pass-123")).rejects.toThrow();
  });
});
