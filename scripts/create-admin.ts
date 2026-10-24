import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { group, groupMember, home, user } from "@/db/schema";
import { auth } from "@/lib/auth";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  const { email, name, password } = values;
  if (!email || !name || !password) {
    throw new Error("Usage: npm run create-admin -- --email … --name … --password …");
  }

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing) throw new Error(`A user with email ${email} already exists`);

  const { user: admin } = await auth.api.createUser({
    body: { email, name, password, role: "admin" },
  });

  const [existingHome] = await db.select({ id: home.id }).from(home).limit(1);
  if (!existingHome) await db.insert(home).values({});

  let [everyone] = await db.select({ id: group.id }).from(group).where(eq(group.name, "Everyone"));
  if (!everyone) [everyone] = await db.insert(group).values({ name: "Everyone" }).returning({ id: group.id });
  await db.insert(groupMember).values({ groupId: everyone.id, userId: admin.id }).onConflictDoNothing();

  console.log(`Admin ${email} created.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
