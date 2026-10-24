import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

const NINETY_DAYS = 60 * 60 * 24 * 90;

// Secret/URL come from BETTER_AUTH_SECRET / BETTER_AUTH_URL (read by Better Auth
// itself from process.env, validated in src/lib/env.ts).
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  session: { expiresIn: NINETY_DAYS },
  user: {
    additionalFields: {
      locale: { type: "string", required: false, defaultValue: "en", input: false },
      pushTime: { type: "string", required: false, defaultValue: "08:30", input: false },
      lastDigestOn: { type: "string", required: false, input: false },
    },
  },
  plugins: [admin(), nextCookies()],
});
