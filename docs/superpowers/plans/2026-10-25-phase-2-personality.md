# Phase 2 — Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every plant a voice, a mood and its own news. That means a group-scoped "Plant news" feed on the home screen, written by Claude Haiku in each plant's personality, with fallback templates. It also adds derived moods on photo avatars, one-tap growth moments, a monthly portrait task with a photo timeline, and birthdays.

**Architecture:** Every post is a `feed_event` row: a type plus a neutral JSON payload, created by small lib functions. Those functions are called from the existing completion, plant-creation and photo code, and from the 15-minute cron tick. Post text is generated per event for all three locales in one Haiku call and cached in `feed_text`. Rendering never waits for it: a missing text falls back to a message-file template. Mood, highlights and birthday dates are pure functions in `src/lib/feed/`, and the DB layer calls them.

**Tech Stack:** Same as Phase 1: Next.js 16 (`next build --webpack`), React 19, TypeScript, Tailwind 4 via PostCSS, Drizzle 0.45 + Postgres 17, Better Auth, next-intl, Anthropic SDK 1.3 + zod, MinIO/S3, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-25-phase-2-personality-design.md`. Parent spec: `docs/superpowers/specs/2026-10-24-plant-care-app-design.md`. Phase 1 rulings R1–R21: `docs/superpowers/phase-1-followups.md`.

## Global Constraints

- **Posts never send a push notification.** The morning digest stays about care, plus one extra line when one of the user's plants has a birthday or logs a first flower that day (e.g. "🎂 It's Strelitzia's birthday today").
- **Each person sees only posts about plants in their own groups**, the same access rule as tasks (`visibleGroupIds`). Posts of dead or given-away plants drop out.
- **Highlights:** posts from the last 3 days, max 5. Big moments rank above routine ones, ties go by recency. If there are none in 3 days, show the latest 3 whatever their age; with no posts at all, hide the section. A "See all" page lists every visible post, newest first.
- **One action → one post.** Precedence: `moment` (photo attached if any) > `photo` > `thanks`. Photo tasks are never thanked. Skips are never posted. A completed repot posts a "repotted" `moment`, with no `thanks`.
- **`thanks`:** at most one per plant per day (home timezone). It credits the person who completed the task.
- **Feed text model:** exactly `claude-haiku-5-5`, through `withBudget("feed_text", …)`, an *optional* feature. When the budget is exhausted or the call fails, a template from the message files is shown. Never send `temperature`, `top_p` or `top_k`.
- **Tone:** affectionate and a little cheeky, each plant in its own character. One to three sentences, an emoji is allowed. Never contradict the care profile, and only organic / non-chemical products if any are named. The approved sample posts in spec §3 are the tone reference.
- **Locales:** exactly `en`, `fr`, `pt-BR`. Every new UI string and template goes in all three message files with identical keys.
- **"Today", birthdays and day boundaries** use the home timezone (`Europe/Madrid`).
- **Mood** (first match wins):
  - 🥳 **proud:** a moment in the last 3 days
  - 😤 **sulking:** a counted task > 3 days overdue
  - 🥵 **needy:** a counted task due today or overdue
  - 😴 **sleepy:** dormant season and nothing due
  - 😊 **happy:** otherwise

  Counted tasks are `water`, `settle_check`, `repot`, `fertilize`. Mood posts only on a change *into* or *out of* sulking.
- **Plants that already exist when Phase 2 deploys** get no `first` post. Their first cron run sets the mood and season baselines without posting.
- **Low data entry:** moments and photos are one or two taps. Mobile-first at 390×844.
- **`AI_MODE=mock`** must make every new AI path deterministic and free of network calls.

## Review Focus

1. **Two people tick the same task at once, or a stale tab ticks it.** Only the winning completion creates a `thanks` post; an `already_done` result creates none. *Pinned in Task 4.*
2. **The model call fails, is refused, returns empty text, or the budget is spent.** The feed shows the template in the reader's language and never a blank card, and the event isn't retried forever. *Pinned in Task 6.*
3. **A plant is moved to another group on its edit page.** Its posts, old ones included, follow the plant's *current* group: the old group's members stop seeing them and the new group's members start. *Pinned in Task 7.*
4. **Someone mis-taps "Flower".** The author can delete the moment and its post disappears for everyone. Another user cannot delete it (404, no change). *Pinned in Task 4.*
5. **Around Madrid midnight.** Birthdays and the thanks once-per-day rule follow the Madrid date. At 23:30 UTC, it is already the next Madrid day. *Pinned in Task 2 and Task 4.*

---

## File Structure

```
src/db/schema.ts                    # + photo.kind, plant.lastMood, home.lastSeason, feed_event.textAttempts
drizzle/0001_*.sql                  # generated additive migration
src/lib/feed/types.ts               # Mood, MomentType, PostType, payload types, BIG_POST_TYPES
src/lib/feed/mood.ts                # moodOf() — pure
src/lib/feed/highlights.ts          # pickHighlights() — pure
src/lib/feed/birthdays.ts           # birthdayKind() — pure
src/lib/feed/events.ts              # create/dedupe events, logMoment, deleteMoment, recordThanks, recordFirst
src/lib/feed/text.ts                # generateFeedTexts(), renderPostText(), templates
src/lib/feed/queries.ts             # feedForUser(), currentMoods()
src/lib/feed/cron.ts                # runMoodChanges, runSeasonChanges, runBirthdays, runFeedTextFill, backfillPhotoTasks
src/lib/plants/photos.ts            # addPlantPhoto(), plantTimeline()
src/lib/care/schedule.ts            # photo task in initialTasks + nextDue
src/lib/tasks/complete.ts           # hook: thanks / repotted moment after a successful completion
src/lib/tasks/create.ts             # photo kinds, first post, photo task
src/lib/push/digest.ts              # birthday / first-flower line
src/app/api/cron/tick/route.ts      # wire the new cron steps
src/components/plant-avatar.tsx     # round photo + mood badge
src/components/feed-post.tsx        # one post card
src/components/moment-picker.tsx    # New leaf / New growth / Flower / Repotted (/ Nothing new)
src/components/task-card.tsx        # avatar + photo-task "Take photo"
src/app/(app)/page.tsx              # Plant news section
src/app/(app)/news/page.tsx         # See all
src/app/(app)/plants/[id]/page.tsx  # avatar, timeline, compare, Something new?, moments list
src/app/(app)/plants/[id]/actions.ts# addPlantPhotoAction, logMomentAction, deleteMomentAction
src/app/(app)/plants/[id]/edit/*    # personality fields
messages/{en,fr,pt-BR}.json         # new `feed` namespace + keys
```

---

### Task 1: Schema additions and photo kinds

**Files:**
- Modify: `src/db/schema.ts`, `src/lib/tasks/create.ts`, `src/app/(app)/plants/new/actions.ts` + `add-plant-form.tsx` (send which key is the label photo), `src/lib/tasks/queries.ts` (`coverUrls` unaffected), `tests/integration/setup.ts` only if it hard-codes tables
- Create: `drizzle/0001_*.sql` via `npm run db:generate`, `src/lib/feed/types.ts`
- Test: `tests/integration/schema.test.ts` (extend), `tests/integration/create-plant.test.ts` (extend)

**Interfaces:**
- Produces, in `@/db/schema`:
  - `photoKind` pgEnum `plant | label`
  - `photo.kind` (not null, default `plant`)
  - `plant.lastMood` (text, nullable)
  - `home.lastSeason` (text, nullable)
  - `feedEvent.textAttempts` (int, not null, default 0)
- Produces, in `@/lib/feed/types` (no DB imports):
  - `type Mood = "proud" | "sulking" | "needy" | "sleepy" | "happy"`
  - `type MomentType = "new_leaf" | "new_growth" | "flower" | "repotted"`
  - `type PostType = "thanks" | "moment" | "photo" | "birthday" | "mood" | "season" | "first"`
  - `BIG_POST_TYPES: ReadonlySet<PostType>` = `moment`, `photo`, `birthday`, `first`
  - `MOOD_EMOJI: Record<Mood, string>`
  - The payload shape per type, as a discriminated union `PostPayload`, each case also carrying `mood: Mood`:

    | Type | Payload fields |
    |---|---|
    | `thanks` | `{ userId, userName, taskType }` |
    | `moment` | `{ momentId, momentType, photoId: string \| null, userName, firstFlower: boolean }` |
    | `photo` | `{ photoId, userName, previousPhotoAt: string \| null }` |
    | `birthday` | `{ kind: "month" \| "year", years: number }` |
    | `mood` | `{ from: Mood, to: Mood }` |
    | `season` | `{ season: Season, growing: boolean }` |
    | `first` | `{ userName }` |

- `CreatePlantInput` gains `labelPhotoKey: string | null`. That key is stored with `kind: "label"` and is never the cover.

- [ ] **Step 1: Write the failing tests.**
  - `schema.test.ts`: a new photo defaults to `kind === "plant"`, and a `feed_event` defaults to `textAttempts === 0`.
  - `create-plant.test.ts`: creating a plant with two photo keys, where the second is `labelPhotoKey`, stores one `plant` and one `label` photo. The cover is the `plant` one.
- [ ] **Step 2:** Run `npm run test:int -- schema create-plant`. Expected: FAIL.
- [ ] **Step 3:** Implement the schema and types and generate the migration. In the add-plant form, send the label slot's key as `labelPhotoKey`. Phase 1 already tracks the `"photo" | "label"` slot in `add-plant-form.tsx`.
- [ ] **Step 4:** Run `npm run test:int` and `npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(db): photo kinds and personality columns`.

---

### Task 2: Pure feed logic: mood, highlights, birthdays

**Files:**
- Create: `src/lib/feed/mood.ts`, `src/lib/feed/highlights.ts`, `src/lib/feed/birthdays.ts`
- Test: `tests/unit/mood.test.ts`, `tests/unit/highlights.test.ts`, `tests/unit/birthdays.test.ts`

**Interfaces:**
- Consumes: `Season`, `isGrowing` (`@/lib/care/season`); `daysBetween`, `addMonths`, `todayIn` (`@/lib/time`); `TaskType` (`@/lib/care/types`); the types from Task 1.
- Produces:
  - **Mood:** `MOOD_TASK_TYPES: ReadonlySet<TaskType>` = `water`, `settle_check`, `repot`, `fertilize`.
  - **Mood:** `moodOf(input: { today: string; season: Season; tasks: { type: TaskType; dueOn: string; active: boolean }[]; lastMomentOn: string | null }): Mood`, following the Global Constraints rules. "More than 3 days overdue" means `daysBetween(dueOn, today) > 3`.
  - **Highlights:** `pickHighlights<T extends { type: PostType; createdAt: Date }>(posts: T[], now: Date): T[]`, with constants `HIGHLIGHT_DAYS = 3`, `HIGHLIGHT_MAX = 5`, `HIGHLIGHT_FALLBACK = 3`.
  - **Birthdays:** `birthdayKind(joinedOn: string, today: string): { kind: "month" | "year"; years: number } | null`.
    - `month` when `today === addMonths(joinedOn, 1)`.
    - `year` when today is the same month and day as `joinedOn` with `years ≥ 1`.
    - A 29 Feb join celebrates on 28 Feb in non-leap years.
  - **Birthdays:** `joinedOn(createdAt: Date, tz: string): string`, which is `todayIn(tz, createdAt)`.

- [ ] **Step 1: Write the failing tests.**

  `mood.test.ts`, with today `"2026-11-10"`:

  | Input | Expected |
  |---|---|
  | water due `"2026-11-06"` | `"sulking"` (4 days overdue) |
  | water due `"2026-11-07"` | `"needy"` |
  | only a `photo` task due `"2026-11-01"`, autumn | `"sleepy"` |
  | only a `photo` task due `"2026-11-01"`, summer | `"happy"` |
  | moment on `"2026-11-08"` plus water 10 days overdue | `"proud"` |
  | water due `"2026-11-20"`, winter | `"sleepy"` |
  | water due `"2026-11-20"`, spring | `"happy"` |

  `highlights.test.ts`, with now `2026-11-10T12:00Z`:
  - posts 1 h, 2 d, 5 d old (types `thanks`, `moment`, `photo`) → `[moment(2 d), thanks(1 h)]`.
  - 7 posts in the last day → 5, big moments first.
  - only posts 10 and 20 days old → the latest 3 of them.
  - `[]` → `[]`.

  `birthdays.test.ts`:
  - `birthdayKind("2026-10-24", "2026-11-24")` → `{kind:"month", years:0}`
  - `("2026-10-24", "2027-10-24")` → `{kind:"year", years:1}`
  - `("2026-10-24", "2026-11-25")` → `null`
  - `("2028-02-29", "2029-02-28")` → `{kind:"year", years:1}`
  - `joinedOn(new Date("2026-10-24T23:30:00Z"), "Europe/Madrid")` → `"2026-10-25"` (Review Focus 5)
- [ ] **Step 2:** Run `npm run test:unit -- mood highlights birthdays`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(feed): mood, highlights and birthday rules`.

---

### Task 3: Monthly photo task

**Files:**
- Modify: `src/lib/care/schedule.ts`, `src/lib/tasks/complete.ts` (`ALLOWED_OUTCOMES.photo` stays `done | skipped`)
- Create: `src/lib/feed/cron.ts` (only `backfillPhotoTasks` in this task)
- Test: `tests/unit/schedule.test.ts` (extend), `tests/integration/photo-task.test.ts`

**Interfaces:**
- Consumes: `addMonths` (`@/lib/time`), the `photo.kind` column (Task 1).
- Produces:
  - `initialTasks(...)` also returns `{ type: "photo", dueOn: addMonths(today, 1) }`.
  - `nextDue({ type: "photo", outcome: "done" | "skipped", today, … })` gives `{ dueOn: addMonths(today, 1) }`. This replaces Phase 1's thrown error.
  - `backfillPhotoTasks(today: string): Promise<number>`: alive plants with no `photo` care_task row get one due `addMonths(day of the latest plant-kind photo, else the plant's joinedOn, 1)`. It inserts with onConflictDoNothing and returns the count.

- [ ] **Step 1: Write the failing tests.**
  - `schedule.test.ts`: `initialTasks({today:"2026-10-25", …})` contains `photo "2026-11-25"`, and `nextDue({type:"photo", outcome:"skipped", today:"2026-11-25", …}).dueOn === "2026-12-25"`.
  - `photo-task.test.ts`: a plant with only a water task and a plant photo taken `2026-10-24` → `backfillPhotoTasks("2026-10-25")` creates `photo` due `"2026-11-24"`. A second call creates 0. A label-only plant uses its joinedOn instead.
- [ ] **Step 2:** Run `npm run test:unit -- schedule && npm run test:int -- photo-task`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(care): monthly portrait task`.

---

### Task 4: Feed events: moments, thanks, first posts, precedence

**Files:**
- Create: `src/lib/feed/events.ts`
- Modify: `src/lib/tasks/complete.ts` (hook after a successful transaction), `src/lib/tasks/create.ts` (first post)
- Test: `tests/integration/feed-events.test.ts`

**Interfaces:**
- Consumes: `getPlantForUser` (`@/lib/access`), `todayIn`, `moodOf` (Task 2), the types from Task 1.
- Produces:
  - **Generic event creation:** `createEvent(plantId: string, type: PostType, payload: Omit<PostPayload, "mood">, today: string): Promise<string>`. It adds `mood: await currentMood(plantId, today)` to the payload, inserts the event and returns its id. All the functions below, and Task 8's cron, use it.
  - **Mood at event time:** `currentMood(plantId: string, today: string): Promise<Mood>`. It loads the tasks, the latest moment and the season, then calls `moodOf`. Event payloads store this mood.
  - **Thanks:** `recordThanks(input: { plantId; userId; taskType: TaskType; outcome: TaskOutcome; today: string }): Promise<string | null>`. Returns the event id, or null when no post is made. It posts nothing when:
    - the outcome is `skipped`;
    - the task type is `photo` or `repot`;
    - a `thanks` event already exists for this plant on `today`. That check uses the home-tz date of `createdAt`, so only the first completion of the day gets thanked.
  - **Moments:** `logMoment(userId: string, plantId: string, momentType: MomentType, photoId: string | null): Promise<{ momentId: string; eventId: string }>`.
    - It calls `getPlantForUser` first.
    - It creates the moment and one `moment` event with `firstFlower` (true when this is the plant's first `flower` moment).
  - **Deleting moments:** `deleteMoment(userId: string, momentId: string): Promise<void>`.
    - The moment must exist, be visible to the user and be authored by them; otherwise `notFound()`.
    - It deletes the moment and its `moment` event (matched on `payload.momentId`).
  - **First post:** `recordFirst(plantId: string, userId: string): Promise<string>`.
- `completeTask` changes. After the transaction returns `ok`, and never on `already_done`, in a try/catch that logs and never fails the completion:
  - `repot` + `done` → `logMoment(userId, plantId, "repotted", null)`;
  - otherwise → `recordThanks(...)`.
- `createPlantWithTasks` calls `recordFirst` after the plant transaction, also in a logged try/catch.

- [ ] **Step 1: Write the failing tests** in `feed-events.test.ts`, with groups YA {Y, A} and M {M} and one YA plant:
  - Y waters (`done`) and then A waters again the same day → 1 `thanks` event, crediting Y.
  - `Promise.all` of Y's and A's completions with the same `expectedVersion` → exactly 1 `thanks` event, credited to the `ok` winner (Review Focus 1).
  - `skipped` → 0 events. Repot `done` → 1 `moment` (`repotted`) and 0 `thanks`.
  - Two waterings on Madrid days 2026-11-10 and 2026-11-11 → 2 `thanks` (use fake Date at `2026-11-10T23:30Z` = 11 Nov Madrid, Review Focus 5).
  - `logMoment(Y, plant, "flower")` twice → `firstFlower` true, then false.
  - `deleteMoment(A, momentByY)` → rejects with the Next 404 digest, and the moment and event still exist. `deleteMoment(Y, …)` removes both (Review Focus 4).
  - `logMoment(M, yaPlant, …)` → 404, no rows.
  - `createPlantWithTasks` → exactly 1 `first` event.
- [ ] **Step 2:** Run `npm run test:int -- feed-events`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:int`. Expected: all PASS, including Phase 1's `complete` and `create-plant` tests.
- [ ] **Step 5:** Commit with `feat(feed): events for thanks, moments and new plants`.

---

### Task 5: Adding a photo to a plant

**Files:**
- Create: `src/lib/plants/photos.ts`
- Test: `tests/integration/plant-photos.test.ts`

**Interfaces:**
- Consumes:
  - `assertDraftKeys`, `getObjectBytes`, `jpegSize` (Phase 1)
  - `logMoment` (Task 4)
  - `getPlantForUser`
- Produces:
  - **`addPlantPhoto(userId: string, plantId: string, draftKey: string, momentType: MomentType | null): Promise<{ photoId: string; eventId: string }>`**. In order:
    1. Access check.
    2. Inserts a `kind: "plant"` photo, with size from the JPEG.
    3. Sets `plant.coverPhotoId` to it.
    4. Upserts the plant's `photo` care task to `dueOn = addMonths(today, 1)`, `active = true`, `version + 1`. A new photo from any source pushes the reminder out.
    5. Posts exactly one event (one action → one post): `momentType` set → `logMoment(..., photoId)`, otherwise one `photo` event with `previousPhotoAt` = the date of the previous plant photo or null.
  - **`plantTimeline(plantId: string): Promise<{ id: string; url: string; takenAt: Date }[]>`**: plant-kind photos only, newest first, with signed URLs.

- [ ] **Step 1: Write the failing tests:**
  - `addPlantPhoto(Y, p, key, null)` gives 1 `photo` event, cover = the new photo and the photo task due today + 1 month.
  - `addPlantPhoto(Y, p, key, "new_leaf")` gives 1 `moment` event with `photoId` set and 0 `photo` events.
  - `addPlantPhoto(M, yaPlant, …)` gives 404 and no rows.
  - `plantTimeline` excludes label photos.
- [ ] **Step 2:** Run `npm run test:int -- plant-photos`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(plants): add photos with moments and timeline`.

---

### Task 6: Post text: Haiku generation and templates

**Files:**
- Create: `src/lib/feed/text.ts`
- Modify: `src/lib/ai/mock.ts` (feed-text fixture), `messages/{en,fr,pt-BR}.json` (new `feed` namespace), `tests/unit/messages.test.ts` (add `feed` to the namespace list)
- Test: `tests/unit/feed-templates.test.ts`, `tests/integration/feed-text.test.ts`

**Interfaces:**
- Consumes:
  - `callStructured`, `withBudget`, `BudgetExceededError` (`@/lib/ai/*`)
  - `createTranslator` (next-intl)
  - the event payload types (Task 1)
- Produces:
  - **The model's output:** `FeedTexts` zod schema `{ en: string; fr: string; "pt-BR": string; persona: { summary: string; traits: string[] } | null }`.
  - **`generateFeedTexts(eventId: string, deps?: { call?: ... }): Promise<"stored" | "template">`**:
    - **Skip:** returns `"template"` without calling when `feed_text` rows already exist or `textAttempts >= 2`.
    - **Call:** increments `textAttempts`, then makes one Haiku call through `withBudget("feed_text", null, "claude-haiku-5-5", …)` and `callStructured` with `maxTokens: 2000`.
    - **Prompt:** the system prompt is a module constant and contains the tone rules and the approved samples from spec §3. The user turn carries the plant's name, species, personality, mood, event type, payload and dates.
    - **Store:** saves the 3 texts after trimming them and capping each at 280 characters. Any empty text counts as a failure.
    - **Persona:** fills `plant.persona` when it was null and the output has one.
    - **Fallback:** `BudgetExceededError`, a refusal, a null output or a thrown API error all mean nothing is stored, a log line, and `"template"`.
    - **Mock mode:** `AI_MODE=mock` returns the fixture (`"[en] …"`, `"[fr] …"`, `"[pt-BR] …"`) without the network.
  - **`renderPostText(event: { type: PostType; payload: PostPayload; plantName: string }, locale: Locale, stored: string | null): string`**: the stored text, else `feed.template.<type>` from the message files with the payload values.
- **Templates** (en wording; translate for fr / pt-BR):

  | Key | en |
  |---|---|
  | `thanks` | "Thanks for the care, {userName} 💧" |
  | `moment` | "🌱 New {moment}!" (moment label from `feed.moments.*`) |
  | `photo` | "📸 New photo, taken by {userName}" |
  | `birthday` | "🎂 {years, plural, =0 {One month with you!} one {One year with you!} other {# years with you!}}" |
  | `mood` | "{to, select, sulking {I'm sulking a little… 😤} other {Feeling better now 😊}}" |
  | `season` | "{growing, select, true {Growing season! Time to wake up 🌞} other {Going into winter mode 😴}}" |
  | `first` | "Hello! I just moved in 🌿" |

- [ ] **Step 1: Write the failing tests:**
  - `feed-templates.test.ts`: `renderPostText({type:"thanks", payload:{userName:"Marcela",…}, plantName:"Pachira"}, "fr", null)` contains `"Marcela"`. With a stored text, it returns the stored text unchanged.
  - `feed-text.test.ts` (`AI_MODE=mock`): generation stores 3 rows and a second call does not call again. With the cap at $0 and $0.01 spent, the result is `"template"`, no rows and `textAttempts === 1`. An injected call that returns `{en:"",…}` stores nothing. After 2 failed attempts, a 3rd call does not invoke `deps.call`. A null persona is filled from the output (Review Focus 2).
- [ ] **Step 2:** Run `npm run test:unit -- feed-templates messages && npm run test:int -- feed-text`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `feed` and all keys to the three message files.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(feed): plant-voice post text with template fallback`.

---

### Task 7: Feed queries and visibility

**Files:**
- Create: `src/lib/feed/queries.ts`
- Test: `tests/integration/feed-queries.test.ts`

**Interfaces:**
- Consumes:
  - `visibleGroupIds`
  - `pickHighlights` (Task 2)
  - `renderPostText` (Task 6)
  - `coverUrls`, `signedUrl`
  - `moodOf` / `currentMood` (Tasks 2 and 4)
- Produces:
  - **The post shape:** `type FeedPost = { id: string; type: PostType; createdAt: Date; text: string; mood: Mood; plant: { id: string; name: string; coverUrl: string | null }; photoUrl: string | null }`.
  - **`feedForUser(userId: string, locale: Locale, opts: { mode: "highlights" } | { mode: "all"; before?: Date; limit?: number }): Promise<FeedPost[]>`**:
    - It returns events of alive plants whose *current* `groupId` is visible to the user.
    - `all` is newest first, with `limit` 20 and paged by `before`.
    - `highlights` runs the last 30 days of posts through `pickHighlights`.
    - The `mood` is the one stored in the payload.
  - **`currentMoods(plantIds: string[], today: string): Promise<Map<string, Mood>>`**: the batch version used by the avatars.

- [ ] **Step 1: Write the failing tests**, with groups YA, M and ALL and events on plants in each:
  - M's `all` contains only M and ALL plants.
  - A dead plant's events are absent.
  - After `updatePlant` moves a YA plant into M, M sees its old events and Y no longer does (Review Focus 3).
  - A text in `fr` is returned for an `fr` reader. An `en` reader without a stored text gets the template.
  - `before` paging returns the next page without overlap.
- [ ] **Step 2:** Run `npm run test:int -- feed-queries`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(feed): group-scoped feed queries`.

---

### Task 8: Cron: moods, seasons, birthdays, text fill, digest line

**Files:**
- Modify: `src/lib/feed/cron.ts`, `src/app/api/cron/tick/route.ts`, `src/lib/push/digest.ts`, `messages/*` (`push.birthdayLine`, `push.firstFlowerLine`)
- Test: `tests/integration/feed-cron.test.ts`, `tests/integration/digest.test.ts` (extend)

**Interfaces:**
- Consumes:
  - `currentMood`, `createEvent` (Task 4)
  - `birthdayKind`, `joinedOn` (Task 2)
  - `generateFeedTexts` (Task 6)
  - `backfillPhotoTasks` (Task 3)
  - `seasonOf`, `isGrowing`
- Produces:
  - **`runMoodChanges(today: string): Promise<number>`**, for each alive plant:
    - with `lastMood` null, it sets the baseline and posts nothing;
    - on a change into or out of `sulking`, it posts a `mood` event;
    - it always stores the new `lastMood`.
  - **`runSeasonChanges(today: string): Promise<number>`**:
    - with `home.lastSeason` null, it sets the baseline and posts nothing;
    - when the season changes and `isGrowing` flips, it posts one `season` event per alive plant;
    - it always stores the new season.
  - **`runBirthdays(today: string): Promise<number>`**: one `birthday` event per plant per occasion. The guard against duplicates is an existing event of the same kind and years.
  - **`runFeedTextFill(limit = 10): Promise<number>`**: calls `generateFeedTexts` for events from the last 2 days that have no texts and `textAttempts < 2`, oldest first.
  - **Cron tick order:** retries, then backfill (Phase 1), then `backfillPhotoTasks`, `runBirthdays`, `runMoodChanges`, `runSeasonChanges`, `runFeedTextFill`, then digests. Each step sits in its own try/catch so one failure doesn't stop the others. The JSON response adds the counts.
  - **`runDigests` addition:** if one of the user's visible plants got a `birthday` event or a `moment` with `firstFlower: true` today, the body gains one line per plant (`push.birthdayLine` / `push.firstFlowerLine`).
    - A user with no due tasks but such an event still gets one digest that day.
    - The once-per-day claim from Phase 1 R17 is unchanged.
- [ ] **Step 1: Write the failing tests:**
  - **First run:** a fresh deploy, i.e. plants with `lastMood` null and `home.lastSeason` null → no `mood` or `season` events. Baselines are stored.
  - **Mood change:** water made 4 days overdue → the next `runMoodChanges` posts 1 `mood` (`to: "sulking"`). Running it again posts 0.
  - **Season change:** `lastSeason` `"summer"`, today in autumn → 1 `season` event per alive plant.
  - **Birthdays:** a plant created `2026-10-24T10:00Z` → `runBirthdays("2026-11-24")` posts 1, and running it again posts 0.
  - **Text fill:** posts with missing texts → `runFeedTextFill` stores them in mock mode.
  - **Digest:** a user with no due tasks whose plant has a birthday today → 1 push, and the body contains the plant name.
- [ ] **Step 2:** Run `npm run test:int -- feed-cron digest cron-route`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(feed): cron moods, seasons, birthdays and texts`.

---

### Task 9: Home screen news, "See all" and avatars

**Files:**
- Create: `src/components/plant-avatar.tsx`, `src/components/feed-post.tsx`, `src/app/(app)/news/page.tsx`
- Modify: `src/app/(app)/page.tsx`, `src/components/task-card.tsx`, `src/app/(app)/plants/page.tsx`, `src/app/(app)/tasks/actions.ts` and `src/app/(app)/plants/new/actions.ts` (after() → `runFeedTextFill`), `messages/*`
- Test: `e2e/feed.spec.ts`

**Interfaces:**
- Consumes: `feedForUser`, `currentMoods` (Task 7); `addPlantPhoto` (Task 5).
- Produces:
  - **Avatar:** `<PlantAvatar coverUrl={string|null} mood={Mood} size="sm"|"md"|"lg" />`. It is a round photo, or a 🌿 placeholder, with an emoji mood badge.
  - **Post card:** `<FeedPost post={FeedPost} />`. It shows the avatar with the post-time mood, the name, the text, an optional photo and the relative time, and links to `/plants/<id>`.
  - **Home:** "Plant news" sits below "Needs attention" and above the action buttons, with a "See all" link to `/news`. It is hidden when there are no posts.
  - **`/news`:** `mode: "all"` with a "Load more" button that pages by `before`.
  - **Photo task card:** **Take photo** (camera input → downscale → `uploadDraftPhoto` → moment chips New leaf / New growth / Flower / Nothing new → `addPlantPhotoAction`) and **Skip** (`completeTaskAction(..., "skipped")`).
  - **Avatars everywhere:** the task cards and the plant list show `PlantAvatar` with the current mood.
  - **Post text:** every server action that can create events (task completion, add photo, log moment, create plant) schedules `runFeedTextFill()` (Task 8) with `after()` from `next/server`, so new posts get their text within seconds instead of waiting for the next cron tick.
- [ ] **Step 1: Write the failing e2e** `e2e/feed.spec.ts` (iPhone 14, `AI_MODE=mock`, seeded YA plant with a photo task due today, logged in as Y):
  - Tap **Take photo**, upload `e2e/fixtures/pilea.jpg`, then tap **New leaf**. The photo task disappears from "Needs attention".
  - Exactly one Plant news card appears, and it contains an `<img>`.
  - "See all" lists it.
  - A second context logged in as M doesn't see it.
- [ ] **Step 2:** Run `npm run test:e2e -- feed`. Expected: FAIL.
- [ ] **Step 3:** Implement. Put all strings in the three locales.
- [ ] **Step 4:** Run `npm run test:e2e`. Expected: all PASS, including Phase 1 specs (update selectors only if needed).
- [ ] **Step 5:** Commit with `feat: plant news on home, see-all page, mood avatars`.

---

### Task 10: Plant page: timeline, compare, moments, personality editing

**Files:**
- Create: `src/components/moment-picker.tsx`, `src/app/(app)/plants/[id]/actions.ts`
- Modify:
  - `src/app/(app)/plants/[id]/page.tsx`
  - `src/lib/plants/update.ts`
  - `src/app/(app)/plants/[id]/edit/*`
  - `messages/*`
- Test: `tests/integration/update-plant.test.ts` (extend), `e2e/moments.spec.ts`

**Interfaces:**
- Consumes:
  - `addPlantPhoto`, `plantTimeline` (Task 5)
  - `logMoment`, `deleteMoment` (Task 4)
  - `currentMood`
- Produces:
  - **Server actions** (thin wrappers with `requireUser`, then the lib call, then `revalidatePath` of the plant page and `/`): `addPlantPhotoAction(plantId, draftKey, momentType | null)`, `logMomentAction(plantId, momentType)`, `deleteMomentAction(momentId)`.
  - **`UpdatePlantInput`** gains `persona: { summary: string (1–300 chars); traits: string[] (0–5, each 1–40 chars) } | null`.
  - **Plant page, top to bottom:**
    1. `PlantAvatar size="lg"` with the current mood, and a mood label.
    2. A **"Something new? 🌱"** button that opens `MomentPicker` with New leaf / New growth / Flower / Repotted.
    3. An **"Add photo"** button with the same flow as the photo task.
    4. **Moments:** the latest 10, each showing a delete (✕) button only to its author.
    5. The **timeline:** a horizontal strip of photos, newest first.
    6. A **"Compare"** toggle that shows the first and latest plant photos side by side. It is hidden when there are fewer than 2.
    7. The existing care sections.
  - **Edit page:** a personality summary textarea and a comma-separated traits input.
- [ ] **Step 1: Write the failing tests:**
  - `update-plant.test.ts`: saving a persona `{summary:"Dramatic diva", traits:["proud","thirsty"]}` stores it, and a 301-character summary is rejected.
  - `e2e/moments.spec.ts`:
    - As Y on a YA plant page, tap **Something new?** → **Flower**. The home Plant news shows a flower post.
    - On the plant page, tap ✕ on that moment. The post is gone from home.
    - As A, no ✕ is shown on Y's moment.
- [ ] **Step 2:** Run `npm run test:int -- update-plant && npm run test:e2e -- moments`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite: `npm run test:unit && npm run test:int && npm run test:e2e && npm run build`. Expected: all PASS, and the `check-css` postbuild passes.
- [ ] **Step 5:** Commit with `feat(plants): timeline, compare, moments and personality editing`.

---

### Task 11: Deploy and live check (manual, with Yann)

This task has no code.

- [ ] Push `main` and redeploy on Coolify. The migration runs on start. Within 15 minutes, the next cron tick backfills a portrait task for every existing plant and sets the mood and season baselines without posting.
- [ ] Add a photo with "New leaf" to one plant. Check the post appears in your language within a minute or so, in the plant's voice (live Haiku), and that Adriana sees it while Marcela doesn't, if it's a Yann+Adriana plant.
- [ ] After a few days, check the admin AI spend. Feed text should stay in the cents.
- [ ] A week of use, then note any tone or volume adjustments.
