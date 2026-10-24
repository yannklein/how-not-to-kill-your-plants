# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-hosted, installable plant-care PWA for three users. They can add a plant from a photo (AI identifies it and builds its care profile), see and tick off care tasks shared within plant groups, and get those tasks in their own calendar and as a morning push.

**Architecture:** One Next.js 16 App Router app, with server components and server actions for UI, and route handlers for the auth, calendar, push and cron endpoints. Postgres via Drizzle holds all state. The schema covers every phase in the spec, so later phases add no breaking migrations. All care scheduling is pure functions in `src/lib/care/` with no I/O; the DB layer calls them inside transactions. AI calls go through one budget-aware wrapper. Photos go to MinIO (S3 API). A Coolify scheduled task hits `/api/cron/tick` every 15 minutes.

**Tech Stack:**
- App: Node 24, npm, Next.js 16.4, React 19, TypeScript (strict), Tailwind 4 + shadcn/ui
- Data and auth: Drizzle ORM 0.45 + `postgres` driver, Better Auth 1.7 (email/password + admin plugin)
- Platform features: next-intl 4.14, @serwist/next 9.5, web-push 3.6, ical-generator 11, @aws-sdk/client-s3
- AI: @anthropic-ai/sdk 1.3 + zod
- Tests: Vitest 5, Playwright 1.64, Docker Compose (Postgres 17 + MinIO) for local dev and integration tests

**Spec:** `docs/superpowers/specs/2026-10-24-plant-care-app-design.md` (sections 2, 4, 5, 6, 10 and 11 → Phase 1).

## Global Constraints

- Three accounts, **invite-only**, no public sign-up, **no email service**. The admin (Yann) creates one-time invite links and resets passwords from an admin screen.
- Locales are exactly `en`, `fr` and `pt-BR` (Brazilian). Each user picks one. The default is `en`.
- There is one home: location "Barcelona", hemisphere `N`, timezone `Europe/Madrid`, all editable by the admin. All "today" and due-date logic uses the home timezone, never the server's or UTC.
- Shared tasks: everyone in the plant's group sees a due task. The first completion clears it for all and records who did it.
- Watering task outcomes are exactly **Watered**, **Still moist** and **Skip**. Repotting after purchase uses a settling-in check about **14 days** after acquisition.
- "Just bought?" defaults to yes, with the acquired date = today.
- Calendar is one-way: a per-user secret-token ICS URL, **one all-day event per day** that has due tasks, regenerable in Settings.
- Push: **one morning digest per user** at a time they choose (default `08:30` home time), only on days with due or overdue tasks.
- AI models are exactly `claude-sonnet-5-5` (identification, care profiles) and `claude-haiku-5-5` (reserved for Phase 2 text). Never send `temperature`, `top_p` or `top_k` (the API returns a 400 since 2026-10-21). Never append date suffixes to model IDs.
- The AI spend cap is **$20/month** by default, with a warning to the admin at **80%**. At the cap only *optional* features pause. Identification and care profiles are *essential* and keep running.
- All care and fertilizer advice the AI produces is **organic / non-chemical first**.
- Low data entry is the #1 anti-goal. Adding a plant needs only a photo plus confirm taps; every field is prefilled. The target is under 30 seconds.
- Mobile-first: every screen is designed for a 390×844 viewport first.

## Review Focus

1. **Two people tick the same task at nearly the same time, or one does it from a stale tab.** Expected: exactly one completion is recorded, and the second person sees "Already done by Adriana" instead of the schedule advancing twice. *Pinned in Task 9.*
2. **Day boundaries around midnight in Madrid**, e.g. 00:30 Madrid is 22:30 UTC on the previous day. Expected: "today", overdue status, the ICS event dates and the digest all follow `Europe/Madrid`. *Pinned in Task 5 (time helpers) and Task 12 (ICS).*
3. **AI identification fails, refuses, is not confident, or the photo isn't a plant.** Expected: the user can still finish adding the plant by typing or picking a species, and the plant is saved. A missing care profile is retried by cron. *Pinned in Task 8 and Task 10.*
4. **Large iPhone photos** (HEIC, 5–12 MB, EXIF rotation). Expected: the upload succeeds and the photo shows the right way up. *Pinned in Task 7 (client-side downscale to JPEG) and Task 10 (e2e with a rotated fixture).*
5. **Marcela opens a Yann+Adriana plant or task by URL or ID, or someone hits an ICS URL with a revoked token.** Expected: 404, with no data leaked and no completion. Plants that are dead or given away drop out of the home screen, ICS and digest. *Pinned in Task 6 (access) and Task 12 (ICS).*

---

## File Structure

```
docker-compose.yml               # postgres:17 (5432 dev, 5433 test), minio
Dockerfile                       # multi-stage, Next standalone output
drizzle.config.ts
vitest.config.ts                 # projects: unit (no DB), integration (TEST_DATABASE_URL)
playwright.config.ts             # iPhone 14 viewport, AI_MODE=mock
scripts/create-admin.ts          # one-off bootstrap of Yann's admin account
docs/deploy.md                   # Coolify setup
messages/{en,fr,pt-BR}.json
src/
  db/schema.ts                   # ALL tables, all phases
  db/client.ts                   # drizzle(postgres(DATABASE_URL))
  db/migrate.ts                  # runs migrations at container start
  lib/env.ts                     # zod-validated env
  lib/time.ts                    # home-timezone day helpers
  lib/auth.ts / auth-client.ts   # Better Auth server / client
  lib/session.ts                 # requireUser(), requireAdmin()
  lib/invites.ts
  lib/access.ts                  # group-based authorization
  lib/storage.ts                 # S3/MinIO put + signed get
  lib/ai/{client,pricing,budget,schemas,identify,care-profile,mock}.ts
  lib/care/{season,watering,schedule}.ts   # pure functions
  lib/tasks/{complete,queries,create}.ts   # DB side of care
  lib/calendar/ics.ts
  lib/push/{send,digest}.ts
  lib/image/downscale.ts         # client-side resize/orientation
  i18n/request.ts
  app/(auth)/login, app/(auth)/invite/[token]
  app/(app)/layout.tsx           # session guard + bottom tab bar
  app/(app)/page.tsx             # home "Needs attention"
  app/(app)/plants/{page,new/page,[id]/page,[id]/edit/page}.tsx
  app/(app)/settings/{page,admin/page}.tsx
  app/api/auth/[...all]/route.ts
  app/api/calendar/[token]/route.ts
  app/api/cron/tick/route.ts
  app/api/push/subscribe/route.ts
  app/api/health/route.ts
  app/manifest.ts, app/sw.ts
tests/unit/**, tests/integration/**, e2e/**
```

---

### Task 1: Scaffold, environment, local services, test harness

**Files:**
- Create: the project via `npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`, then `docker-compose.yml`, `src/lib/env.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `src/app/api/health/route.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `env` (a typed object) from `@/lib/env` with keys `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY` (optional when `AI_MODE=mock`), `AI_MODE` (`"live" | "mock"`, default `"live"`), `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `APP_URL`. Also `parseEnv(raw: Record<string,string|undefined>): Env`.
- npm scripts: `dev`, `build`, `test:unit`, `test:int`, `test:e2e`, `db:generate`, `db:migrate`, `create-admin`.

- [ ] **Step 1:** Scaffold with create-next-app (command above). Init shadcn/ui (`npx shadcn@latest init`, neutral base, CSS variables). Add a `docker-compose.yml` with `db` (postgres:17, port 5432), `db-test` (postgres:17, port 5433, tmpfs) and `minio` (ports 9000/9001, creates the bucket `plants` through an `mc` init container).
- [ ] **Step 2: Write the failing test** `tests/unit/env.test.ts`:
  - `parseEnv` throws when `DATABASE_URL` is missing.
  - `parseEnv({...valid, AI_MODE: undefined}).AI_MODE === "live"`.
  - `parseEnv({...valid, AI_MODE: "mock", ANTHROPIC_API_KEY: undefined})` does not throw.
  - `parseEnv({...valid, AI_MODE: "live", ANTHROPIC_API_KEY: undefined})` throws.
- [ ] **Step 3:** Run `npm run test:unit -- env`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement `parseEnv` with zod (`superRefine` for the key-required-when-live rule) and export `env = parseEnv(process.env)`. Lazily evaluate it so `next build` works without secrets.
- [ ] **Step 5:** Run `npm run test:unit`. Expected: PASS. Run `docker compose up -d` and `npm run dev`, then `curl localhost:3000/api/health`. Expected: `{"ok":true}`.
- [ ] **Step 6:** Commit with `chore: scaffold next app, env, local services`.

---

### Task 2: Database schema for all phases

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `drizzle.config.ts`, `tests/integration/setup.ts` (migrates a fresh `db-test` schema per run and truncates between tests)
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces: `db` from `@/db/client`, and table objects plus enums from `@/db/schema`, as listed below. Better Auth's own tables (`user`, `session`, `account`, `verification`) are generated with `npx @better-auth/cli generate` in Task 3 into the same file. Domain columns on `user` are declared through Better Auth `additionalFields`: `role` (`"admin" | "user"`, from the admin plugin), `locale` (`"en" | "fr" | "pt-BR"`, default `"en"`), `pushTime` (text `"HH:MM"`, default `"08:30"`), `lastDigestOn` (date, nullable).

Enums:
- `taskType`: `water | settle_check | repot | fertilize | rotate | dust | mist | photo`
- `taskOutcome`: `done | still_moist | skipped | rootbound_yes | rootbound_no`
- `plantStatus`: `alive | dead | given_away`
- `lightLevel`: `low | medium | bright_indirect | direct`
- `aiFeature`: `identify | care_profile | feed_text | tips | chat | discover`

Tables (ids are `uuid` with `defaultRandom()`, every table has `createdAt`):
- `home`: one row. `name`, `city` ("Barcelona"), `hemisphere` (`"N" | "S"`), `timezone` ("Europe/Madrid"), `aiMonthlyCapUsd` (numeric, 20), `aiWarnedForMonth` (text `YYYY-MM`, nullable).
- `invite`: `token` (unique, 32-byte base64url), `createdBy` (user), `expiresAt`, `usedAt`, `usedBy`.
- `group`: `name`. `group_member`: (`groupId`, `userId`) as the primary key.
- `spot`: `name`, `lightLevel`, `windowDirection` (`N|NE|E|SE|S|SW|W|NW|none`), `notes`.
- `species`: `scientificNameKey` (unique, normalized), `scientificName`, `commonNames` (jsonb `{en,fr,"pt-BR"}`), `careProfile` (jsonb, nullable until generated), `careProfileStatus` (`pending | ready | failed`), `profileAttempts` (int).
- `plant`: `groupId`, `spotId` (nullable), `speciesId` (nullable while pending), `name`, `persona` (jsonb `{summary, traits[]}` in the creator's locale, nullable), `acquiredOn` (date), `justBought` (bool), `potSizeCm` (int, nullable), `status`, `waterIntervalOverrideDays` (int, nullable), `coverPhotoId` (nullable).
- `care_task`: `plantId`, `type`, `dueOn` (date), `state` (jsonb, used by watering), `version` (int, default 0), `active` (bool). Unique (`plantId`, `type`).
- `task_completion`: `taskId`, `plantId`, `type`, `userId`, `outcome`, `completedAt`.
- `photo`: `plantId`, `userId`, `objectKey`, `width`, `height`, `takenAt`.
- Phase 2+ tables, created now and unused: `moment`, `feed_event`, `feed_text`, `chat_thread`, `chat_message`, `wishlist_item`. Columns as in spec §10: feed_text is keyed (`eventId`, `locale`). Chat messages hold `role` + `content` jsonb.
- `push_subscription`: `userId`, `endpoint` (unique), `p256dh`, `auth`.
- `calendar_token`: `userId` (unique), `token` (unique).
- `ai_usage`: `feature`, `model`, `userId` (nullable), `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd` (numeric 10,6), `month` (text `YYYY-MM` in home time).

- [ ] **Step 1: Write the failing test** `tests/integration/schema.test.ts`. Insert a home, a group, a species, a plant and a `care_task(type:"water")`. Then assert:
  - A second `care_task` with the same (`plantId`, `"water"`) rejects with a unique violation.
  - `plant.status` defaults to `"alive"`.
- [ ] **Step 2:** Run `npm run test:int -- schema`. Expected: FAIL.
- [ ] **Step 3:** Write the schema, generate the migration (`npm run db:generate`) and write `migrate.ts`, which uses `drizzle-orm/postgres-js/migrator`.
- [ ] **Step 4:** Run `npm run test:int -- schema`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(db): full schema for all phases`.

---

### Task 3: Auth, admin bootstrap, invites, password reset

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/lib/invites.ts`, `scripts/create-admin.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/invite/[token]/page.tsx`
- Test: `tests/integration/invites.test.ts`

**Interfaces:**
- Consumes: `db`, `invite`, `user` (Task 2).
- Produces:
  - `auth` (Better Auth instance: `emailAndPassword: { enabled: true, disableSignUp: true }`, the `admin()` plugin, `nextCookies()`, session `expiresIn` of 90 days).
  - `requireUser(): Promise<SessionUser>` (redirects to `/login`), `requireAdmin(): Promise<SessionUser>` (404 for non-admins). `SessionUser = { id, name, email, role, locale, pushTime }`.
  - `createInvite(adminId: string): Promise<{ token: string; url: string; expiresAt: Date }>` (7-day expiry).
  - `acceptInvite(token: string, input: { name: string; email: string; password: string }): Promise<{ userId: string }>`, which throws `InviteError("expired" | "used" | "not_found")`. It creates the user through `auth.api.createUser` (admin plugin) inside the same flow and marks the invite used.
  - `resetPassword(adminId: string, userId: string, newPassword: string)` wraps the admin plugin's `setUserPassword`.
  - Verify the exact admin plugin method names against the Better Auth 1.7 docs before coding.

- [ ] **Step 1: Write the failing tests** in `tests/integration/invites.test.ts`:
  - `acceptInvite` with a valid token creates a user with `role:"user"` and sets `invite.usedAt`.
  - Accepting the same token a second time throws `InviteError` with `code === "used"`.
  - A token whose `expiresAt` is in the past throws `code === "expired"`.
  - An unknown token throws `code === "not_found"`.
  - `auth.api.signUpEmail` (public sign-up) is rejected.
- [ ] **Step 2:** Run `npm run test:int -- invites`. Expected: FAIL.
- [ ] **Step 3:** Implement `auth.ts`, `invites.ts` and `session.ts`. Generate the Better Auth tables into `schema.ts` and make a new migration. Build the login page (email + password) and the invite page (name, email, password, then auto sign-in and redirect to `/`). Write `scripts/create-admin.ts --email --name --password`. On first run it also creates the `home` row with its defaults and a group "Everyone" containing the admin.
- [ ] **Step 4:** Run `npm run test:int -- invites`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(auth): invite-only accounts with admin bootstrap`.

---

### Task 4: i18n (en / fr / pt-BR) and app shell

**Files:**
- Create: `src/i18n/request.ts`, `messages/en.json`, `messages/fr.json`, `messages/pt-BR.json`, `src/app/(app)/layout.tsx` (session guard plus a bottom tab bar: Home · Plants · ＋ · Settings)
- Modify: `next.config.ts` (next-intl plugin)
- Test: `tests/unit/messages.test.ts`

**Interfaces:**
- Produces: `type Locale = "en" | "fr" | "pt-BR"` and `LOCALES` from `@/i18n/locales` (used by every later task); `getRequestConfig` that resolves the locale from the session user's `locale`. When signed out it falls back to the `NEXT_LOCALE` cookie, then `Accept-Language` (match on the `fr` / `pt` prefixes, mapping `pt` to `pt-BR`), then `en`. URLs carry no locale prefix. Message namespaces: `common`, `auth`, `home`, `plants`, `addPlant`, `tasks`, `settings`, `calendar`, `push`, `care`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/messages.test.ts`:
  - The three JSON files have identical deep key sets.
  - No value is empty.
  - `resolveLocale({ userLocale: null, cookie: null, acceptLanguage: "pt-PT,pt;q=0.9" }) === "pt-BR"`.
  - `resolveLocale({ userLocale: "fr", cookie: "en", acceptLanguage: "en" }) === "fr"`.
- [ ] **Step 2:** Run `npm run test:unit -- messages`. Expected: FAIL.
- [ ] **Step 3:** Implement `resolveLocale` (exported from `src/i18n/request.ts`) and the message files: real translations, not placeholders. Build the shell layout.
- [ ] **Step 4:** Run `npm run test:unit -- messages`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(i18n): en/fr/pt-BR with per-user locale`.

---

### Task 5: Home-timezone time helpers and seasons

**Files:**
- Create: `src/lib/time.ts`, `src/lib/care/season.ts`
- Test: `tests/unit/time.test.ts`, `tests/unit/season.test.ts`

**Interfaces:**
- Produces:
  - `todayIn(tz: string, now?: Date): string` returns `YYYY-MM-DD`.
  - `addDays(day: string, n: number): string`, `daysBetween(a: string, b: string): number` (b − a).
  - `localTimeIn(tz: string, now?: Date): string` returns `HH:MM`, and `monthKeyIn(tz: string, now?: Date): string` returns `YYYY-MM`.
  - `type Season = "spring"|"summer"|"autumn"|"winter"`; `seasonOf(day: string, hemisphere: "N"|"S"): Season`. N: Mar–May spring, Jun–Aug summer, Sep–Nov autumn, Dec–Feb winter. S is shifted by 6 months.
  - `isGrowing(season: Season): boolean` (spring or summer).
  - `nextSpringDay(after: string, hemisphere): string`, the first `MM-15` strictly after `after` (03-15 for N, 09-15 for S).
  - `nextGrowingStart(after: string, hemisphere): string`, the first `MM-01` strictly after `after` (03-01 for N, 09-01 for S).
- Use `Intl.DateTimeFormat` with `timeZone`; no date library is needed.

- [ ] **Step 1: Write the failing tests:**
  - `todayIn("Europe/Madrid", new Date("2026-10-24T22:30:00Z")) === "2026-10-25"` (00:30 in Madrid).
  - `todayIn("Europe/Madrid", new Date("2026-03-29T00:30:00Z")) === "2026-03-29"` (DST change day).
  - `addDays("2026-10-25", 14) === "2026-11-08"`; `daysBetween("2026-10-24","2026-11-08") === 15`.
  - `seasonOf("2026-10-24","N") === "autumn"`; `seasonOf("2026-10-24","S") === "spring"`.
  - `nextSpringDay("2026-11-07","N") === "2027-03-15"`; `nextSpringDay("2027-03-15","N") === "2028-03-15"`.
  - `nextGrowingStart("2026-10-24","N") === "2027-03-01"`.
- [ ] **Step 2:** Run `npm run test:unit -- time season`. Expected: FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run `npm run test:unit -- time season`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(care): home-timezone dates and seasons`.

---

### Task 6: Groups, spots, home settings and access control

**Files:**
- Create: `src/lib/access.ts`, `src/app/(app)/settings/admin/page.tsx` (sections: Home, Groups and members, Spots, Invites, Reset password, AI cap), `src/app/(app)/settings/admin/actions.ts`
- Test: `tests/integration/access.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createInvite`, `resetPassword` (Task 3).
- Produces:
  - `visibleGroupIds(userId: string): Promise<string[]>`.
  - `getPlantForUser(userId: string, plantId: string): Promise<Plant>`, which throws `notFound()` when the plant is not in one of the user's groups.
  - `getTaskForUser(userId: string, taskId: string): Promise<CareTask & { plant: Plant }>`, which also throws `notFound()`.
  - `listPlantsForUser(userId: string, opts?: { includeInactive?: boolean }): Promise<Plant[]>`. By default it returns only `status = "alive"`.
  - Admin server actions: `saveHome`, `upsertGroup(name, memberIds[])`, `upsertSpot`, `deleteSpot` (sets plants' `spotId` to null), `createInviteAction`, `resetPasswordAction`, `setAiCap`.

- [ ] **Step 1: Write the failing tests** in `tests/integration/access.test.ts`. Fixture: users Y, A, M; groups YA {Y, A}, M {M}, ALL {Y, A, M}; one plant in each group.
  - `listPlantsForUser(M)` returns exactly the M plant and the ALL plant.
  - `getPlantForUser(M, yaPlant.id)` throws a not-found error.
  - `getTaskForUser(M, yaPlantWaterTask.id)` throws a not-found error.
  - After the YA plant is set to `status:"dead"`, `listPlantsForUser(Y)` no longer contains it.
- [ ] **Step 2:** Run `npm run test:int -- access`. Expected: FAIL.
- [ ] **Step 3:** Implement `access.ts`, the admin actions (each starting with `requireAdmin()`) and the admin page (mobile forms built from shadcn components).
- [ ] **Step 4:** Run `npm run test:int -- access`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: groups, spots, home settings, group-based access`.

---

### Task 7: Photo storage and client-side downscale

**Files:**
- Create: `src/lib/storage.ts`, `src/lib/image/downscale.ts`, `src/app/(app)/plants/upload-action.ts`
- Test: `tests/integration/storage.test.ts`, `e2e/fixtures/rotated-exif.jpg`, `e2e/fixtures/pilea.jpg`

**Interfaces:**
- Produces:
  - `putObject(key: string, body: Buffer, contentType: string): Promise<void>`.
  - `signedUrl(key: string, ttlSeconds?: number /* 3600 */): Promise<string>`.
  - `photoKey(plantIdOrDraft: string): string` returns `photos/<id>/<uuid>.jpg`.
  - Client side: `downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }>`. It uses `createImageBitmap(file, { imageOrientation: "from-image" })` and an `OffscreenCanvas` (falling back to `<canvas>`), and outputs JPEG. This is also what handles HEIC on iOS, since Safari decodes it.
  - Server action `uploadDraftPhoto(formData): Promise<{ key: string; url: string; width: number; height: number }>`. It accepts `image/jpeg` up to **4 MB** after downscaling and rejects anything else with a translated error.

- [ ] **Step 1: Write the failing tests** in `tests/integration/storage.test.ts` (runs against MinIO from compose):
  - `putObject` followed by fetching `signedUrl` returns the same bytes.
  - `uploadDraftPhoto` with a 5 MB buffer rejects with `"too_large"`.
  - `uploadDraftPhoto` with `image/png` rejects with `"bad_type"`.
- [ ] **Step 2:** Run `npm run test:int -- storage`. Expected: FAIL.
- [ ] **Step 3:** Implement with `@aws-sdk/client-s3` (`forcePathStyle: true`) and `@aws-sdk/s3-request-presigner`.
- [ ] **Step 4:** Run `npm run test:int -- storage`. Expected: PASS. The browser-side downscale and EXIF orientation are verified in Task 10's e2e.
- [ ] **Step 5:** Commit with `feat: photo storage with client-side downscale`.

---

### Task 8: AI layer: client, pricing, budget, identification, care profile

**Files:**
- Create: `src/lib/ai/{client,pricing,budget,schemas,identify,care-profile,mock}.ts`
- Test: `tests/unit/ai-pricing.test.ts`, `tests/unit/ai-schemas.test.ts`, `tests/integration/ai-budget.test.ts`, `tests/integration/care-profile.test.ts`

**Interfaces:**
- Produces:
  - `PRICING` (USD per million tokens):
    - `claude-sonnet-5-5`: input 2.00, output 10.00, cacheRead 0.20, cacheWrite 2.50
    - `claude-haiku-5-5`: input 0.10, output 0.50, cacheRead 0.01, cacheWrite 0.125
  - `costUsd(model: AiModel, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number|null; cache_creation_input_tokens?: number|null }): number`.
  - `ESSENTIAL: ReadonlySet<AiFeature>` = `{"identify","care_profile"}`.
  - `withBudget<T>(feature: AiFeature, userId: string|null, model: AiModel, call: () => Promise<{ result: T; usage: Usage }>): Promise<T>`. If the feature is not essential and the month's spend is at or over the cap, it throws `BudgetExceededError` and the call never runs. Otherwise it runs the call, records an `ai_usage` row, and when the spend crosses 80% for the first time in the month, sets `home.aiWarnedForMonth`.
  - `monthSpend(): Promise<{ spentUsd: number; capUsd: number; warn: boolean }>`, where `warn` means at least 80%.
  - zod schemas in `schemas.ts`:
    - `IdentifyResult = { isPlant: boolean; candidates: { scientificName: string; commonName: string; confidence: number /*0..1*/ }[] /*max 3, best first*/; labelText: string|null; potSizeCm: number|null; suggestedNames: string[] /*3, playful*/; persona: { summary: string; traits: string[] /*3*/ } }`
    - `CareProfile = { light: LightLevel; waterIntervalDays: { growing: {min:number;max:number}; dormant: {min:number;max:number} }; humidity: "low"|"medium"|"high"; tempC: {min:number;max:number}; repotEveryMonths: number; fertilizeEveryDays: number; rotateEveryDays: number; dustEveryDays: number; mistEveryDays: number|null; text: Record<"en"|"fr"|"pt-BR", { summary: string; soilMix: string; organicFertilizers: string[]; commonProblems: string[]; toxicity: string }> }`
  - `normalizeScientificName(name: string): string`: lowercase, trims, collapses spaces, strips cultivar quotes and the `var.`/`cv.` suffix, and keeps genus plus species.
  - `identifyPlant(input: { images: { base64: string; mediaType: "image/jpeg" }[]; locale: Locale; userId: string }): Promise<IdentifyResult>` calls `claude-sonnet-5-5` with `client.messages.parse` + `zodOutputFormat(IdentifyResult)`, `output_config.effort: "medium"`, `max_tokens: 4000`. The system prompt says the label text is a strong hint, so trust a legible label over the photo. On `stop_reason === "refusal"` or `parsed_output === null` it returns `{ isPlant:false, candidates:[], ... }` and does not throw.
  - `ensureCareProfile(speciesId: string): Promise<"ready"|"failed">` generates the profile with `claude-sonnet-5-5` + `zodOutputFormat(CareProfile)`. The system prompt requires organic or non-chemical fertilizer and remedy suggestions and fills `text` for all three locales. Sets `careProfileStatus`. After 3 failed attempts it stays `"failed"`, and Settings → admin shows a "Retry" button.
  - `getOrCreateSpecies(scientificName: string, commonName: string): Promise<Species>` upserts on `scientificNameKey`.
  - The system prompts are module constants placed first with `cache_control: {type:"ephemeral"}` (stable prefix, so no dates or user data in them).
  - Refusal fallback: also pass `betas: ["server-side-fallback-2026-07-01"]` with `fallbacks: "default"` on `client.beta.messages.parse`, if SDK 1.3 types accept it. If not, use `client.messages.parse` and rely on the refusal handling above.
  - `AI_MODE=mock` makes `identifyPlant` and `ensureCareProfile` return fixtures from `mock.ts`: Pilea peperomioides with confidence 0.92, and a full Pilea profile with growing 7–10 days and dormant 10–14 days. Mock calls record usage at $0.01.

- [ ] **Step 1: Write the failing tests:**
  - `ai-pricing.test.ts`: `costUsd("claude-sonnet-5-5", {input_tokens:1_000_000, output_tokens:0}) === 2`; `costUsd("claude-haiku-5-5", {input_tokens:0, output_tokens:1_000_000}) === 0.5`; `costUsd("claude-sonnet-5-5", {input_tokens:0, output_tokens:0, cache_read_input_tokens:1_000_000}) === 0.2`.
  - `ai-schemas.test.ts`: `normalizeScientificName("Ficus elastica 'Tineke'") === "ficus elastica"`; `normalizeScientificName("  Strelitzia   NICOLAI ") === "strelitzia nicolai"`; `CareProfile.parse(mockProfile)` succeeds; a profile missing `text["pt-BR"]` fails.
  - `ai-budget.test.ts`, with the cap at $1 and $1.00 of usage seeded for the current month: `withBudget("chat", …)` rejects with `BudgetExceededError` and the call spy is never invoked. `withBudget("identify", …)` runs and records a row. With $0.79 seeded, a $0.02 call sets `home.aiWarnedForMonth` to the current `YYYY-MM`.
  - `care-profile.test.ts` (`AI_MODE=mock`): `ensureCareProfile` sets `careProfileStatus:"ready"` and stores a profile that parses. When the mocked call throws three times, the status is `"failed"` and `profileAttempts === 3`.
- [ ] **Step 2:** Run `npm run test:unit -- ai && npm run test:int -- ai-budget care-profile`. Expected: FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(ai): budgeted Claude client, identification, care profiles`.

---

### Task 9: Care engine: initial tasks, adaptive watering, completion

**Files:**
- Create: `src/lib/care/watering.ts`, `src/lib/care/schedule.ts`, `src/lib/tasks/complete.ts`
- Test: `tests/unit/watering.test.ts`, `tests/unit/schedule.test.ts`, `tests/integration/complete.test.ts`

**Interfaces:**
- Consumes: `seasonOf`, `isGrowing`, `addDays`, `daysBetween`, `nextSpringDay`, `nextGrowingStart` (Task 5); `CareProfile` (Task 8).
- Produces:
  - `type WaterState = { learned: { growing: number|null; dormant: number|null }; lastWateredOn: string|null; moistCount: number }`.
  - `baseInterval(profile, season, state, overrideDays: number|null): number`. Precedence: the override, then the learned value for the season bucket, then `round((min+max)/2)` of the bucket's range.
  - `nextWater(input: { today: string; outcome: "done"|"still_moist"|"skipped"; state: WaterState; profile: CareProfile; season: Season; overrideDays: number|null }): { dueOn: string; state: WaterState }`. Algorithm:
    - `done`: if `moistCount > 0` and `lastWateredOn` is set, then `actual = daysBetween(lastWateredOn, today)` and the bucket's learned value becomes `clamp(round((base+actual)/2), range.min, round(range.max*1.5))`. Then `lastWateredOn = today`, `moistCount = 0`, and `dueOn = today + (learned ?? base)`.
    - `still_moist`: `moistCount += 1`; `dueOn = today + clamp(round(base*0.25), 2, 7)`.
    - `skipped`: `dueOn = today + 1`; the state is unchanged.
  - `initialTasks(input: { today: string; acquiredOn: string; justBought: boolean; profile: CareProfile; hemisphere: "N"|"S" }): { type: TaskType; dueOn: string; state?: WaterState }[]`. It produces:
    - `water` due at today+3 if just bought, otherwise today+1.
    - `settle_check` at acquiredOn+14, only if just bought.
    - `repot` at `nextSpringDay(today)`, only if *not* just bought.
    - `fertilize` at today+`fertilizeEveryDays` when growing, otherwise `nextGrowingStart(today)`.
    - `rotate` at today+`rotateEveryDays`; `dust` at today+`dustEveryDays`.
    - `mist` at today+`mistEveryDays`, only if that is not null.
  - `nextDue(input: { type; outcome; today; profile; hemisphere; state?; overrideDays? }): { dueOn: string|null; state?: WaterState; spawn?: { type: "repot"; dueOn: string } }`:
    - `water` delegates to `nextWater`.
    - `settle_check`: `rootbound_yes` gives `dueOn: null` (task deactivated) and spawns `repot` at today+3. `rootbound_no` gives `dueOn: null` and spawns `repot` at `nextSpringDay(addDays(today, 30))`.
    - `repot` (`done`): `nextSpringDay(addMonths(today, repotEveryMonths - 2))`.
    - `fertilize` (`done`): `today + fertilizeEveryDays`. If that day is not in a growing season, it's `nextGrowingStart` of that day.
    - `rotate`, `dust`, `mist` (`done` or `skipped`): today + their interval.
  - `completeTask(input: { userId: string; taskId: string; expectedVersion: number; outcome: TaskOutcome }): Promise<{ status: "ok"; nextDueOn: string|null } | { status: "already_done"; by: { name: string }; at: Date }>`. In one transaction it:
    1. calls `getTaskForUser` (access);
    2. runs `UPDATE care_task SET dueOn=…, state=…, version=version+1, active=… WHERE id=$1 AND version=$expected` with RETURNING;
    3. on 0 rows, returns `already_done` with the latest completion's user and time;
    4. otherwise inserts `task_completion` and upserts the spawned task.

- [ ] **Step 1: Write the failing tests:**
  - `watering.test.ts`, with the Pilea profile (growing 7–10, dormant 10–14) and season autumn:
    - `done` on 2026-10-24 with an empty state gives `dueOn "2026-11-05"`.
    - Then `still_moist` on 2026-11-05 gives `"2026-11-08"` with `moistCount 1`.
    - Then `done` on 2026-11-08 gives `learned.dormant === 14` and `dueOn "2026-11-22"`.
    - `skipped` on 2026-11-22 gives `"2026-11-23"` with the state unchanged.
    - With `overrideDays: 9`, `done` gives today+9.
  - `schedule.test.ts`:
    - `initialTasks({today:"2026-10-24", acquiredOn:"2026-10-24", justBought:true, profile: pilea, hemisphere:"N"})` contains `water "2026-10-27"`, `settle_check "2026-11-07"` and `fertilize "2027-03-01"`, and no `repot`.
    - `nextDue({type:"settle_check", outcome:"rootbound_no", today:"2026-11-07", …})` gives `dueOn null` and `spawn {type:"repot", dueOn:"2027-03-15"}`.
    - `rootbound_yes` spawns repot `"2026-11-10"`.
    - `nextDue({type:"fertilize", outcome:"done", today:"2027-08-20", fertilizeEveryDays:30})` gives `"2027-09-01"`; `today:"2027-05-20"` gives `"2027-06-19"`.
    - `nextDue({type:"repot", outcome:"done", today:"2027-03-20", repotEveryMonths:24})` gives `"2029-03-15"`.
  - `complete.test.ts` (Review Focus 1). Fixture: group YA with users Y and A, and a plant with a water task at `version 0`.
    - `Promise.all([completeTask({userId:Y, expectedVersion:0, outcome:"done"}), completeTask({userId:A, expectedVersion:0, outcome:"done"})])` gives exactly one `ok` and one `already_done`. The `already_done.by.name` is the other user's name, there is 1 `task_completion` row, and the task has `version === 1`.
    - `completeTask` by M (not in YA) throws a not-found error and inserts no rows.
- [ ] **Step 2:** Run `npm run test:unit -- watering schedule && npm run test:int -- complete`. Expected: FAIL.
- [ ] **Step 3:** Implement. `addMonths(day, n)` goes in `time.ts`, with a test case: `addMonths("2027-03-20", 22) === "2029-01-20"`.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(care): adaptive watering, schedules, race-safe completion`.

---

### Task 10: Add-plant flow

**Files:**
- Create: `src/app/(app)/plants/new/page.tsx`, `src/app/(app)/plants/new/add-plant-form.tsx` (client), `src/app/(app)/plants/new/actions.ts`, `src/lib/tasks/create.ts` (`createPlantWithTasks`)
- Test: `e2e/add-plant.spec.ts`, `tests/integration/create-plant.test.ts`

**Interfaces:**
- Consumes: `downscaleImage`, `uploadDraftPhoto` (Task 7); `identifyPlant`, `getOrCreateSpecies`, `ensureCareProfile` (Task 8); `initialTasks` (Task 9); `visibleGroupIds` (Task 6).
- Produces:
  - `identifyAction(photoKeys: string[]): Promise<IdentifyResult>`.
  - `createPlantAction(input: { photoKeys: string[]; scientificName: string; commonName: string; name: string; persona: IdentifyResult["persona"] | null; groupId: string; spotId: string|null; justBought: boolean; potSizeCm: number|null }): Promise<{ plantId: string }>`. It checks that `groupId` is in `visibleGroupIds`, then creates the species (if new), the plant, the photo rows (the first becomes the cover), and the tasks. If the care profile is not ready, it creates only the water task (due today+3), and the cron tick (Task 13) generates the profile and creates the remaining tasks.
- Flow: one screen, three steps.
  1. **Photo:** a big "Take photo" button (`<input type=file accept="image/*" capture="environment">`) and an optional "Add label photo" button. Each photo is downscaled and uploaded, then identification runs automatically.
  2. **Confirm:** the top candidate is preselected, the others appear as chips, and "Something else" opens a free-text species field. If `isPlant` is false or there are no candidates, that free-text field opens directly with a short message (Review Focus 3). The name comes prefilled from the first suggested name, with the other names as chips. The group defaults to the user's last used group (localStorage, falling back to the first visible group). The spot is optional. "Just bought?" is a switch, on by default. The pot size is prefilled from the label when it was read.
  3. **Save**, which redirects to the plant profile.

- [ ] **Step 1: Write the failing tests:**
  - `create-plant.test.ts` (`AI_MODE=mock`): `createPlantAction` as M with the YA `groupId` throws a not-found error. As Y with YA, it creates 1 plant, 1 cover photo and tasks including `water` and `settle_check`.
  - `e2e/add-plant.spec.ts` (iPhone 14, `AI_MODE=mock`, logged in as a seeded user):
    - Upload `e2e/fixtures/rotated-exif.jpg`. The preview image has `naturalHeight > naturalWidth` (portrait after the EXIF rotation is applied).
    - "Pilea peperomioides" is preselected, and the name input is not empty.
    - Tapping Save lands on `/plants/<id>`, which shows the plant name.
    - The whole flow takes 5 taps or fewer after the photo is chosen. Count the clicks in the test and assert `≤ 5`.
- [ ] **Step 2:** Run `npm run test:int -- create-plant && npm run test:e2e -- add-plant`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: add plant from photo with AI identification`.

---

### Task 11: Home "Needs attention", plant list, plant profile and edit

**Files:**
- Create: `src/lib/tasks/queries.ts`, `src/app/(app)/page.tsx`, `src/components/task-card.tsx` (client, one-tap buttons), `src/app/(app)/tasks/actions.ts`, `src/app/(app)/plants/page.tsx`, `src/app/(app)/plants/[id]/page.tsx`, `src/app/(app)/plants/[id]/edit/page.tsx`
- Test: `tests/integration/queries.test.ts`, `e2e/shared-task.spec.ts`

**Interfaces:**
- Consumes: `completeTask` (Task 9); `listPlantsForUser`, `getPlantForUser` (Task 6); `todayIn` (Task 5).
- Produces:
  - `dueTasksForUser(userId: string, today: string): Promise<{ plant: Plant & { coverUrl: string|null }; tasks: (CareTask & { overdueDays: number })[] }[]>`. It returns only active tasks of alive plants in the user's groups with `dueOn <= today`. Groups are sorted by their most overdue task first, then by plant name.
  - `upcomingTasksForPlant(plantId: string, limit = 5)`.
  - `completeTaskAction(taskId, expectedVersion, outcome)` wraps `completeTask` and `revalidatePath("/")`. On `already_done` it returns a translated toast message: "Already done by {name}".
- Home layout, top to bottom:
  1. The "Needs attention" list. Each task card has the plant's thumbnail and name, the task label, and an overdue badge. Water shows **Watered / Still moist / Skip**. Settle check shows **Root-bound: Yes / No** with a one-line hint. Other tasks show **Done / Skip**.
  2. An empty state ("All your plants are happy 🌿").
  3. Action buttons: Add plant and My plants. Gardener, Discover and Tips stay hidden until their phases ship.
  4. For admins only: a banner when `monthSpend().warn` is true ("AI spend at {pct}% of ${cap} this month").
- The plant profile shows the cover photo, name, species, care summary (from `careProfile.text[locale]`: light, watering range for the current season, soil mix, organic fertilizers, toxicity), upcoming tasks, and a "Profile being prepared…" badge when the status is `pending`.
- The edit page covers name, group, spot, status (alive / dead / given away), a watering interval override, and the pot size.

- [ ] **Step 1: Write the failing tests:**
  - `queries.test.ts`: for user M, `dueTasksForUser` with `today "2026-11-08"` excludes YA plants and dead plants. A task due on `"2026-11-05"` has `overdueDays === 3`, and its group sorts before a group whose task is due today.
  - `e2e/shared-task.spec.ts`, with two browser contexts (Y and A, both in group ALL) and one plant with water due today: A taps "Watered". After Y reloads, the task is gone. A stale Y page that taps "Watered" sees the "Already done by" toast.
- [ ] **Step 2:** Run `npm run test:int -- queries && npm run test:e2e -- shared-task`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: home needs-attention, plant list, profile, edit`.

---

### Task 12: Calendar ICS feed and personal settings

**Files:**
- Create: `src/lib/calendar/ics.ts`, `src/app/api/calendar/[token]/route.ts`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/actions.ts`
- Test: `tests/unit/ics.test.ts`, `tests/integration/calendar-route.test.ts`

**Interfaces:**
- Consumes: `dueTasksForUser`-style query extended with a horizon (add `tasksForUserUntil(userId, until: string)` to `queries.ts`), `todayIn`, and next-intl `getTranslations({locale})`.
- Produces:
  - `buildIcs(input: { userId: string; locale: Locale; today: string; tz: string; appUrl: string; tasks: { plantName: string; type: TaskType; dueOn: string }[] }): string`, built with ical-generator:
    - One all-day event per distinct day. Overdue tasks map to `today`.
    - The horizon is today+60.
    - `uid = ${userId}-${day}@plants`.
    - The summary is `🌿 ` plus the task labels grouped by type, using the localized verbs, e.g. "🌿 Water Pilea & Pachira · Rotate Strelitzia".
    - The description lists one task per line. `url` is `appUrl`.
    - The calendar name is localized ("My plants"), with `X-PUBLISHED-TTL:PT1H`.
  - `GET /api/calendar/[token]` looks up `calendar_token` and returns 404 if the token is not found. Otherwise it responds with `text/calendar; charset=utf-8` and `Cache-Control: no-store`.
  - Settings actions: `setLocale(locale)`, `setPushTime("HH:MM")` (validated), `getOrCreateCalendarUrl()`, and `regenerateCalendarToken()`, which replaces the token so the old one returns 404. The Settings page shows the language select, push time, the calendar URL with "Copy" and "Add to Apple Calendar" (`webcal://`) buttons, "Regenerate", and a link to the admin page for admins.

- [ ] **Step 1: Write the failing tests:**
  - `ics.test.ts`, with today `"2026-10-25"`, tasks [water Pilea due "2026-10-20", water Pachira "2026-10-25", rotate Strelitzia "2026-10-25", dust Pilea "2027-01-30"], locale `en`:
    - The output contains exactly 1 `BEGIN:VEVENT` (the dust task is beyond the horizon).
    - It has `DTSTART;VALUE=DATE:20261025`.
    - The SUMMARY contains "Water Pilea & Pachira" and "Rotate Strelitzia".
    - With locale `fr`, the SUMMARY contains "Arroser".
  - `calendar-route.test.ts`:
    - An unknown token returns 404.
    - A valid token returns 200 with `content-type` starting with `text/calendar`.
    - After `regenerateCalendarToken`, the old token returns 404 (Review Focus 5).
    - A dead plant's tasks are absent.
- [ ] **Step 2:** Run `npm run test:unit -- ics && npm run test:int -- calendar-route`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: per-user ICS calendar feed and settings`.

---

### Task 13: PWA, web push digest, cron tick

**Files:**
- Create: `src/app/manifest.ts`, `src/app/sw.ts`, `public/icons/*` (192, 512 and maskable PNGs), `src/app/offline/page.tsx`, `src/lib/push/send.ts`, `src/lib/push/digest.ts`, `src/app/api/push/subscribe/route.ts`, `src/app/api/cron/tick/route.ts`, `src/components/install-hint.tsx`, `src/components/push-toggle.tsx`
- Modify: `next.config.ts` (`withSerwist`, swSrc `src/app/sw.ts`)
- Test: `tests/integration/digest.test.ts`, `tests/integration/cron-route.test.ts`

**Interfaces:**
- Consumes: `todayIn`, `localTimeIn`, `monthKeyIn` (Task 5); `dueTasksForUser` (Task 11); `ensureCareProfile`, `monthSpend` (Task 8); `initialTasks` (Task 9).
- Produces:
  - `sendPush(sub: PushSubscription, payload: { title: string; body: string; url: string }): Promise<"sent"|"gone">`. A 404 or 410 from the push service returns `"gone"`, and the caller deletes that subscription.
  - `runDigests(now: Date): Promise<{ sent: number }>`. For each user with at least one subscription, it checks that `localTimeIn(tz) >= pushTime`, that `lastDigestOn !== today`, and that `dueTasksForUser` is non-empty. If so, it sends one push per subscription with a localized title (e.g. "🌿 3 plants need you today"), with the plant names in the body, plus an overdue count when there are overdue tasks. It then sets `lastDigestOn = today`.
  - `runCareProfileRetries(): Promise<number>`. For species with status `pending`, or `failed` with fewer than 3 attempts, it calls `ensureCareProfile`. When a profile becomes ready, it creates the missing initial tasks for that species' plants (upsert on `plantId+type`).
  - `POST /api/cron/tick` requires `Authorization: Bearer ${CRON_SECRET}` (401 otherwise). It runs `runCareProfileRetries`, then `runDigests`, and returns JSON counts. It is idempotent when called repeatedly.
  - `POST /api/push/subscribe` (session-auth) upserts on `endpoint`. `DELETE` removes it.
  - The service worker precaches the app shell and `/offline`, uses network-first for navigations, handles `push` with `showNotification`, and on `notificationclick` opens `url`.
  - `InstallHint`: on iOS Safari when not in standalone mode, it shows "Share → Add to Home Screen". It explains that notifications need this on iPhone, and it can be dismissed.

- [ ] **Step 1: Write the failing tests:**
  - `digest.test.ts` (mock `sendPush`), with home tz Europe/Madrid and user Y with pushTime "08:30", one subscription and 2 due tasks:
    - `runDigests(new Date("2026-11-05T07:00:00Z"))` (08:00 Madrid) sends 0.
    - `runDigests(new Date("2026-11-05T07:45:00Z"))` (08:45) sends 1, and calling it again at 08:00Z sends 0.
    - With no due tasks it sends 0.
    - When `sendPush` returns `"gone"`, the subscription is deleted.
  - `cron-route.test.ts`:
    - A missing or wrong bearer returns 401.
    - With a species stuck at `pending` and a plant having only a water task (`AI_MODE=mock`), the tick sets the species to `ready` and the plant now has `settle_check` and `fertilize` tasks.
- [ ] **Step 2:** Run `npm run test:int -- digest cron-route`. Expected: FAIL.
- [ ] **Step 3:** Implement. Generate VAPID keys with `npx web-push generate-vapid-keys` and record them in `.env.example`.
- [ ] **Step 4:** Run `npm run test:int -- digest cron-route`. Expected: PASS. Then run `npm run build && npm start` and a Lighthouse PWA check (Chrome DevTools, mobile): the app is installable, and `/offline` is served when offline.
- [ ] **Step 5:** Commit with `feat: PWA, web push morning digest, cron tick`.

---

### Task 14: Production build and Coolify deployment

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docs/deploy.md`
- Modify: `next.config.ts` (`output: "standalone"`)

**Interfaces:**
- The container runs `node dist/migrate.js && node server.js` on port 3000. Compile `migrate.ts` with `tsx`, or bundle it with `esbuild` at build time.
- `docs/deploy.md` covers:
  - Coolify resources: a Postgres 17 database, MinIO (bucket `plants`, private), and this app built from the Git repository with the Dockerfile.
  - The full env list from Task 1.
  - A Coolify Scheduled Task, every `*/15 * * * *`: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`.
  - Bootstrapping: `npm run create-admin -- --email … --name Yann --password …` run in the container terminal.
  - Then creating groups (Yann+Adriana, Marcela, Everyone) and spots, and sending invites to Adriana and Marcela.
  - Domain and tunnel setup is left to Yann.

- [ ] **Step 1:** Write the Dockerfile (node:24-alpine, multi-stage, non-root user) and `docs/deploy.md`.
- [ ] **Step 2:** Run `docker build -t plants . && docker run --env-file .env.docker --network host plants`, then `curl localhost:3000/api/health`. Expected: `{"ok":true}`, and migrations are applied (the logs show the migrator finished).
- [ ] **Step 3:** Run the full suite: `npm run test:unit && npm run test:int && npm run test:e2e`. Expected: all PASS.
- [ ] **Step 4:** Commit with `chore: production Dockerfile and Coolify deployment guide`.

---

### Task 15: Acceptance on real devices (manual, with Yann)

This task has no code. It is the spec's §13 verification for Phase 1.

- [ ] Deploy to Coolify following `docs/deploy.md`. Yann creates the groups and spots and invites Adriana and Marcela.
- [ ] Each person adds their own starter plants on their phone through the real flow: Y+A add 5, Marcela adds 3, and someone adds the 2 shared plants to "Everyone". Time a few of them; the target is under 30 seconds each.
- [ ] Each person's home screen shows only plants from their own groups.
- [ ] Subscribe to the ICS link in Apple Calendar and Google Calendar. Events appear, and a completed task disappears after a refresh.
- [ ] Install the PWA on an iPhone (Add to Home Screen) and an Android phone, enable push, and receive the morning digest.
- [ ] Record the AI spend for the 10 plants from the admin page, as a sanity check against the $20 cap.
