import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    AI_MODE: z.enum(["live", "mock"]).default("live"),
    S3_ENDPOINT: z.string().min(1),
    S3_PUBLIC_ENDPOINT: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_SUBJECT: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    APP_URL: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.AI_MODE === "live" && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_MODE=live",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  // Treat empty strings (e.g. `ANTHROPIC_API_KEY=` in .env) as unset.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  return schema.parse(cleaned);
}

let cached: Env | undefined;

// Lazy: parsed on first property access, so importing this module during
// `next build` without secrets does not throw.
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    cached ??= parseEnv(process.env);
    return cached[prop as keyof Env];
  },
});
