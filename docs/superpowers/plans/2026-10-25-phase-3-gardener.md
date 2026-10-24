# Phase 3 — AI Gardener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the AI gardener:
- a private chat with one calm expert who knows the user's plants;
- photo diagnosis;
- one-tap watering and spot changes;
- proactive health warnings (cards at the top of "Needs attention") from photo checks and a weekly pattern check.

**Architecture:**
- `src/lib/gardener/`:
  - pure pattern rules;
  - a context builder;
  - suggestion application;
  - shared alerts;
  - budgeted Sonnet calls (photo check, pattern check, chat reply).
- Photo checks run in the background through `after()` plus a cron fallback.
- The pattern check runs weekly per plant from the cron.
- The chat uses the existing `chat_thread` / `chat_message` tables.
- Warnings live in a new `gardener_alert` table.

**Tech Stack:** Same as Phases 1–2: Next.js 16 (`next build --webpack`), Drizzle/Postgres, Anthropic SDK 1.3 via `callStructured` + `withBudget`, next-intl, Vitest, Playwright (`.next-e2e` dist dir).

**Spec:** `docs/superpowers/specs/2026-10-25-phase-3-gardener-design.md` (including §9, the settled builder answers). Parent spec: `docs/superpowers/specs/2026-10-24-plant-care-app-design.md`.

## Global Constraints

- **Voice:** one calm expert, not the plants' personalities. Organic / non-chemical first. Says so when unsure. Answers in the user's language (`en`, `fr`, `pt-BR`).
- **Model:** `claude-sonnet-5-5`, with the server-side fallback on. Never send `temperature`, `top_p` or `top_k`.
- **Budget:** features `chat` and a new `health_check` are *optional*.
  - **At the cap:** the chat shows "The gardener is back next month" when opened; checks are skipped silently; uploads always succeed.
- **No push notifications** from the gardener. Warning cards never count toward the morning digest.
- **Chats are private** per user. One thread per plant per user, plus one general thread per user. Only the last 20 messages go to the model.
- **Suggestions:** only `{ kind: "water", days }` (sets `waterIntervalOverrideDays`, applies from the next watering) or `{ kind: "spot", spotId }` (any existing home spot). Applied only on the user's tap. One-shot.
- **Warnings:**
  - At most one *open* warning per plant; a newer one replaces it.
  - Shared like tasks: the first person to tap Done / Not now resolves it for the whole group.
  - Done and Not now both suppress the same plant + category for 14 days.
  - No "looks healthy" output.
- **Categories:** exactly `light`, `overwatering`, `underwatering`, `pests`, `nutrients`, `temperature`, `humidity`, `repot`, `other`.
- **Pattern rules:** per plant, whoever answered. Each rule maps to a category:

  | Rule | Category |
  |---|---|
  | `still_moist` ≥ 3 in a row on the water task | `overwatering` |
  | the same task type skipped ≥ 3 in a row | `other` |
  | a care task overdue > 7 days | `underwatering` if water, else `other` |
  | sulking > 7 days | `other` |

  Checked weekly. Only flagged plants go to the model.
- **Photo checks** run on every new plant-kind photo except photos taken while adding a plant. They run in the background and never block or fail the upload. Each photo is checked at most once. Photos that exist when Phase 3 deploys are marked already checked.
- **Placement:** warning cards sit at the top of "Needs attention", above care tasks.
- **Text:** all new UI strings in the three locales. Warning text is generated in all three locales in one call.
- **Mock mode:** `AI_MODE=mock` is deterministic and offline.
  - **Photo check:** the mock reports a `light` problem only when the plant's name contains `"Sick"` (test seam), otherwise no problem.
  - **Chat:** the mock replies `"[mock] " + question`. When the question contains `"water"` (any case), it also adds the suggestion `{ kind: "water", days: 10 }`.

## Review Focus

1. **A warning resolved in one tab, then tapped in a stale tab.** No error, no second resolution, the card just disappears. *Pinned in Task 4.*
2. **AI budget spent.** Opening the chat shows the paused message without calling the model; adding a photo still succeeds and creates no warning. *Pinned in Task 6 and Task 7.*
3. **Someone opens another person's chat, or a chat about a plant outside their groups, by URL or id.** 404, nothing leaked. *Pinned in Task 6.*
4. **A suggestion tapped twice, or after its spot was deleted.** One change at most; a clear "no longer possible" message the second time; no crash. *Pinned in Task 3 and Task 6.*
5. **A health check that fails, is refused, or returns junk.** No warning, the photo is marked checked so it isn't retried forever, and nothing else breaks. *Pinned in Task 5.*

---

## File Structure

```
src/db/schema.ts                         # + gardener_alert, alert enums, photo.checkedAt, plant.lastMoodAt, plant.lastPatternCheckOn, ai_feature + health_check
drizzle/0002_*.sql                       # generated; plus UPDATE photo SET checked_at = now()
src/lib/gardener/types.ts                # ALERT_CATEGORIES, AlertCategory, Suggestion, ChatContent
src/lib/gardener/patterns.ts             # flagPatterns() — pure
src/lib/gardener/context.ts              # plantContext(), householdContext()
src/lib/gardener/suggestions.ts          # applySuggestion()
src/lib/gardener/alerts.ts               # createAlert(), resolveAlert(), openAlertsForUser()
src/lib/gardener/checks.ts               # checkPhoto(), runPhotoChecks(), runPatternChecks() + prompts + mock
src/lib/gardener/chat.ts                 # threads, messages, sendMessage(), acceptChatSuggestion(), seedAlertMessage()
src/lib/feed/cron.ts                     # runMoodChanges also stores lastMoodAt
src/lib/tasks/create.ts                  # add-plant photos created with checkedAt = now
src/app/api/cron/tick/route.ts           # + photo checks, pattern checks (after digests)
src/app/(app)/plants/[id]/actions.ts     # after(runPhotoChecks) on new photos
src/app/(app)/gardener/page.tsx          # thread list (general + per plant) and the open thread
src/app/(app)/gardener/actions.ts        # sendMessageAction, acceptSuggestionAction, resolveAlertAction, openFromAlertAction
src/components/chat-view.tsx             # client chat UI
src/components/alert-card.tsx            # warning card
src/app/(app)/page.tsx                   # alert cards on top + Gardener action button
src/app/(app)/plants/[id]/page.tsx       # "Ask the gardener"
messages/{en,fr,pt-BR}.json              # `gardener` namespace
```

---

### Task 1: Schema and gardener types

**Files:**
- Modify: `src/db/schema.ts`, `src/lib/tasks/create.ts`, `tests/unit/messages.test.ts` (namespace list + `gardener`), `messages/*` (empty `gardener` namespace with `title`)
- Create: `drizzle/0002_*.sql` via `npm run db:generate`, then append `UPDATE "photo" SET "checked_at" = now();`. Create `src/lib/gardener/types.ts`.
- Test: `tests/integration/schema.test.ts` (extend), `tests/integration/create-plant.test.ts` (extend)

**Interfaces:**
- **Produces, in the schema:**
  - **New enums:**
    - `alertCategory`, with the categories from Global Constraints;
    - `alertStatus`: `open | done | dismissed`;
    - `alertSource`: `photo | pattern`.
  - **`ai_feature` gains `health_check`.**
  - **`gardenerAlert`** table:

    | Column | Type |
    |---|---|
    | `id` | uuid |
    | `plantId` | FK cascade |
    | `source` | `alertSource` |
    | `category` | `alertCategory` |
    | `texts` | jsonb `{en,fr,"pt-BR"}` |
    | `suggestion` | jsonb, nullable |
    | `photoId` | uuid, nullable |
    | `status` | default `open` |
    | `resolvedBy` | text FK user, nullable |
    | `resolvedAt` | timestamp, nullable |
    | `createdAt` | timestamp |

    Index on (`plantId`, `status`).
  - **`photo.checkedAt`:** timestamp, nullable.
  - **`plant.lastMoodAt`:** timestamp, nullable.
  - **`plant.lastPatternCheckOn`:** date, nullable.
- **Produces, in `@/lib/gardener/types`, with no DB imports:**
  - `ALERT_CATEGORIES`
  - `type AlertCategory`
  - `type Suggestion = { kind: "water"; days: number } | { kind: "spot"; spotId: string; spotName: string }`
  - `type ChatContent = { text: string; photoKey?: string; suggestion?: Suggestion; applied?: { at: string } | { failed: "gone" | "same" } }`
- `createPlantWithTasks` inserts its photos with `checkedAt: new Date()`.

- [ ] **Step 1: Write the failing tests**
  - `schema.test.ts`: a new `gardener_alert` defaults to `status "open"`. A new photo has `checkedAt === null`.
  - `create-plant.test.ts`: photos created by `createPlantWithTasks` have a non-null `checkedAt`.
- [ ] **Step 2:** Run `npm run test:int -- schema create-plant`. Expected: FAIL.
- [ ] **Step 3:** Implement the schema and migration (including the UPDATE), the types, and the create change.
- [ ] **Step 4:** Run `npm run test:int` and `npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(db): gardener alerts and check markers`.

---

### Task 2: Pattern rules (pure) and the mood timestamp

**Files:**
- Create: `src/lib/gardener/patterns.ts`
- Modify: `src/lib/feed/cron.ts`, so that `runMoodChanges` sets `lastMoodAt = now` whenever `lastMood` changes, including the baseline
- Test: `tests/unit/patterns.test.ts`, `tests/integration/feed-cron.test.ts` (extend)

**Interfaces:**
- **Produces:**
  - `type PatternFlag = { rule: "moist_streak" | "skip_streak" | "overdue" | "sulking"; category: AlertCategory; detail: string }`
  - `flagPatterns(input: { today: string; completions: { taskType: TaskType; outcome: TaskOutcome; day: string }[] /* newest first */; tasks: { type: TaskType; dueOn: string; active: boolean }[]; lastMood: Mood | null; lastMoodOn: string | null }): PatternFlag[]`. It follows the Global Constraints rules. Only `water`, `settle_check`, `repot` and `fertilize` count as care tasks for the overdue rule. Each rule appears at most once.

- [ ] **Step 1: Write the failing tests**
  - `patterns.test.ts`, with today `"2026-11-20"`:

    | Input | Expected |
    |---|---|
    | 3 water `still_moist` answers newest first | `[{rule:"moist_streak", category:"overwatering"}]` |
    | `still_moist, done, still_moist, still_moist` | no moist flag |
    | 3 `rotate` `skipped` in a row | `skip_streak` / `other` |
    | water due `"2026-11-12"` | `overdue` / `underwatering` |
    | fertilize due `"2026-11-12"` | `overdue` / `other` |
    | photo due `"2026-10-01"` | `[]` |
    | `lastMood "sulking"` since `"2026-11-12"` | `sulking` |
    | `lastMood "sulking"` since `"2026-11-15"` | `[]` |
    | a healthy history | `[]` |

  - `feed-cron.test.ts`: after a mood change, `plant.lastMoodAt` is set.
- [ ] **Step 2:** Run `npm run test:unit -- patterns && npm run test:int -- feed-cron`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(gardener): pattern rules`.

---

### Task 3: Context and suggestions

**Files:**
- Create: `src/lib/gardener/context.ts`, `src/lib/gardener/suggestions.ts`
- Test: `tests/integration/gardener-context.test.ts`

**Interfaces:**
- **Consumes:**
  - `getPlantForUser`, `listPlantsForUser`
  - `currentMoods`
  - `plantTimeline`
  - `CareProfile`
  - `seasonOf`
  - `todayIn`
- **Produces:**
  - **`plantContext(plantId: string): Promise<PlantContext>`**. Callers have already checked access. `PlantContext` is a JSON-serializable object with:
    - name, species
    - persona summary
    - care profile essentials: light, the current season's watering range, humidity, soil
    - `waterIntervalOverrideDays`
    - spot `{ name, lightLevel, windowDirection } | null`
    - mood
    - the last 15 completions `{ day, taskType, outcome }`
    - the last 5 moments `{ day, type }`
    - active tasks `{ type, dueOn }`
  - **`householdContext(userId: string): Promise<{ home: { city: string; season: Season }; spots: { id: string; name: string; lightLevel: string; windowDirection: string }[]; plants: { id: string; name: string; species: string | null; spot: string | null; mood: Mood }[] }>`**: only plants in the user's groups, and every home spot.
  - **`applySuggestion(userId: string, plantId: string, s: Suggestion): Promise<"applied" | "gone" | "same">`**:
    - It calls `getPlantForUser` first, which gives a 404 for others.
    - `water` sets `waterIntervalOverrideDays = s.days`, with days an integer from 1 to 60, else a thrown error.
    - `spot` sets `spotId` if the spot exists, else returns `"gone"`.
    - It returns `"same"` when the value is already set.
- [ ] **Step 1: Write the failing tests** in `gardener-context.test.ts`, with groups YA {Y} and M {M}, spots "Bedroom" (low) and "Living room window" (bright_indirect), and a YA plant with 3 `still_moist` completions:
  - `plantContext` includes `spot.name === "Bedroom"` and 3 completions with outcome `still_moist`.
  - `householdContext(M)` excludes the YA plant and includes both spots.
  - `applySuggestion(Y, p, {kind:"water", days:10})` gives `"applied"`, and the override is 10. Applying it again gives `"same"`.
  - `applySuggestion(Y, p, {kind:"spot", spotId: livingRoom, spotName:"…"})` moves the plant. Afterwards, with a deleted spot id, it gives `"gone"` and nothing changes.
  - `applySuggestion(M, p, …)` gives a 404 and nothing changes. `{kind:"water", days:0}` throws.
- [ ] **Step 2:** Run `npm run test:int -- gardener-context`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(gardener): plant context and one-tap suggestions`.

---

### Task 4: Shared alerts

**Files:**
- Create: `src/lib/gardener/alerts.ts`
- Test: `tests/integration/gardener-alerts.test.ts`

**Interfaces:**
- **Produces:**
  - **`SUPPRESS_DAYS = 14`**
  - **`createAlert(input: { plantId: string; source: "photo" | "pattern"; category: AlertCategory; texts: Record<Locale, string>; suggestion: Suggestion | null; photoId?: string | null }): Promise<string | null>`**:
    - Returns null without writing if the same plant + category was resolved (done or dismissed) within 14 days.
    - Otherwise, an existing open alert for the plant becomes `dismissed`, with `resolvedBy` null, and the new one is inserted. This happens in one transaction.
  - **`resolveAlert(userId: string, alertId: string, status: "done" | "dismissed"): Promise<"ok" | "already">`**:
    - Access goes through the alert's plant (`getPlantForUser`, 404 otherwise).
    - A conditional `UPDATE … WHERE id = $1 AND status = 'open'`; 0 rows gives `"already"`.
  - **`type AlertView = { id: string; plantId: string; plantName: string; coverUrl: string | null; category: AlertCategory; text: string; suggestion: Suggestion | null; createdAt: Date }`**
  - **`openAlertsForUser(userId: string, locale: Locale): Promise<AlertView[]>`**: open alerts of alive plants in the user's groups, newest first.
- [ ] **Step 1: Write the failing tests:**
  - **Replace:** creating 2 alerts for one plant leaves only the newer one open.
  - **Suppress:** `resolveAlert(Y, a, "dismissed")` and then `createAlert` with the same category within 14 days returns null. A different category is created.
  - **Stale tab:** `resolveAlert` called twice gives `"ok"`, then `"already"`. With two concurrent calls, exactly one gives `"ok"` (Review Focus 1).
  - **Access:** M cannot resolve a YA alert (404), and `openAlertsForUser(M)` excludes it.
  - **Language:** `openAlertsForUser(Y, "fr")` returns the `fr` text.
- [ ] **Step 2:** Run `npm run test:int -- gardener-alerts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(gardener): shared health alerts`.

---

### Task 5: Health checks (photo and weekly pattern)

**Files:**
- Create: `src/lib/gardener/checks.ts`
- Modify: `src/lib/ai/mock.ts` if useful for fixtures
- Test: `tests/integration/gardener-checks.test.ts`

**Interfaces:**
- **Consumes:** `callStructured`, `withBudget`, `plantContext`, `flagPatterns`, `createAlert`, `getObjectBytes`.
- **Produces:**
  - **`HealthFinding`** zod schema: `{ problem: boolean; category: AlertCategory; texts: { en: string; fr: string; "pt-BR": string }; suggestion: { kind: "water"; days: number } | { kind: "spot"; spotId: string } | null }`.
  - **`checkPhoto(photoId: string, deps?: { call?: (input) => Promise<StructuredOutput> }): Promise<"alert" | "healthy" | "skipped">`**:
    - It sets `photo.checkedAt = now` first, whatever happens next.
    - It sends the photo (base64), the previous plant photo if one exists, the plant context and the spot list to Sonnet, through `withBudget("health_check", …)` with `maxTokens` 16 000.
    - A problem becomes `createAlert(source "photo")`. A spot suggestion is completed with its `spotName` and dropped if the spot doesn't exist.
    - Budget exceeded, a refusal, invalid output or a thrown error give `"skipped"`, with a log line and no alert.
  - **`runPhotoChecks(limit = 5): Promise<number>`**: single-flight (one run at a time). It checks plant-kind photos with `checkedAt` null, oldest first.
  - **`runPatternChecks(today: string, deps?): Promise<number>`**:
    - It looks at alive plants with `lastPatternCheckOn` null or 7 or more days ago, and sets `lastPatternCheckOn = today`.
    - It computes `flagPatterns` and calls the model only if there are flags.
    - It creates an alert with `source "pattern"`. The category is the model's, falling back to the first flag's category.
    - It returns the number of alerts created.
- [ ] **Step 1: Write the failing tests** (`AI_MODE=mock`, injected `deps.call` where needed):
  - **Mock problem:** a plant named "Sick fern" with an unchecked photo gives `checkPhoto` → `"alert"`, an open `light` alert, and `photo.checkedAt` set. A plant named "Fern" gives `"healthy"` and no alert.
  - **Failures (Review Focus 5):** an injected call that throws, returns `{output:null, refused:true}`, or returns junk gives `"skipped"`, no alert, and `checkedAt` set.
  - **Budget:** with the cap at 0 and spend above it, `checkPhoto` gives `"skipped"` and the injected call is not invoked (Review Focus 2).
  - **Photo runner:** `runPhotoChecks` ignores photos whose `checkedAt` is set and label photos.
  - **Pattern runner:**
    - a plant with 3 `still_moist` completions, `today "2026-11-20"`, gives `runPatternChecks` = 1 alert;
    - running it again the same day gives 0, because `lastPatternCheckOn` is set;
    - a healthy plant never calls the model (injected call spy not invoked).
- [ ] **Step 2:** Run `npm run test:int -- gardener-checks`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - **System prompts:** module constants. They describe the calm expert, organic first, and "say so when unsure; report a problem only when visible or clearly implied; never report 'healthy' findings as problems".
  - **Output rules:** the category comes from the fixed list, the texts are in three languages, and a suggestion is either a watering interval or one of the given spot ids.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(gardener): photo and weekly health checks`.

---

### Task 6: Chat

**Files:**
- Create: `src/lib/gardener/chat.ts`
- Test: `tests/integration/gardener-chat.test.ts`

**Interfaces:**
- **Consumes:** `householdContext`, `plantContext`, `applySuggestion`, `withBudget` (`chat`), `callStructured`, `monthSpend`.
- **Produces:**
  - **`getThread(userId: string, plantId: string | null): Promise<{ id: string }>`**: gets or creates. A plant thread requires `getPlantForUser`.
  - **`type ChatMessageView = { id: string; role: "user" | "assistant"; content: ChatContent; createdAt: Date }`**
  - **`listMessages(userId: string, threadId: string): Promise<ChatMessageView[]>`**: the thread must belong to the user, else `notFound()`.
  - **`listThreads(userId: string): Promise<{ id: string; plantId: string | null; plantName: string | null; lastAt: Date }[]>`**
  - **`chatPaused(): Promise<boolean>`**: true when the month's spend has reached the cap.
  - **`sendMessage(userId: string, threadId: string, input: { text: string; photoKey?: string }, deps?): Promise<{ status: "ok" } | { status: "paused" }>`**:
    - The thread must be the user's.
    - When paused, it stores nothing and doesn't call the model.
    - It stores the user message.
    - It calls Sonnet through `withBudget("chat", userId, …)` with:
      - the household context;
      - the thread's plant context, if any;
      - the last 20 messages;
      - the user's locale;
      - the photo, if any.
    - The structured reply is `{ text: string; suggestion: {kind:"water",days}|{kind:"spot",spotId}|null }`.
    - It stores the assistant message.
    - A failure or refusal stores a polite fallback assistant message in the user's language.
  - **`acceptChatSuggestion(userId: string, messageId: string): Promise<"applied" | "gone" | "same" | "already">`**:
    - The message must be in one of the user's threads.
    - If `applied` is already set, it returns `"already"`.
    - Otherwise it calls `applySuggestion`, stores the result on the message (`applied: {at}` or `{failed}`), and appends a short confirmation assistant message.
  - **`seedAlertMessage(userId: string, alertId: string): Promise<{ threadId: string }>`**:
    - It gets the user's plant thread for the alert's plant.
    - Once per user and alert, it inserts the alert text as an assistant message, carrying the alert's suggestion.
- [ ] **Step 1: Write the failing tests** (mock: `"[mock] " + question`, plus a water suggestion when the text contains "water"):
  - **Reply:** `sendMessage(Y, t, {text:"Should I water more?"})` stores 2 messages, and the assistant message has `suggestion {kind:"water", days:10}`.
  - **Accept:** `acceptChatSuggestion` gives `"applied"`, sets the override to 10, and adds a confirmation message. A second call gives `"already"` (Review Focus 4).
  - **Privacy:** `listMessages(A, yannsThread)` gives a 404. `getThread(M, yaPlant)` gives a 404 (Review Focus 3).
  - **Budget:** at the cap, `chatPaused()` is true, `sendMessage` gives `{status:"paused"}`, and nothing is stored (Review Focus 2).
  - **Warning context:** `seedAlertMessage` called twice inserts the alert text only once.
  - **History:** with more than 20 messages, the injected call receives at most 20 history messages.
- [ ] **Step 2:** Run `npm run test:int -- gardener-chat`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(gardener): private chat with one-tap suggestions`.

---

### Task 7: Wiring: cron, photo hook, mood timestamp

**Files:**
- Modify:
  - `src/app/api/cron/tick/route.ts`: add `photoChecks` and `patternAlerts` steps after the digests and before the feed text;
  - `src/app/(app)/plants/[id]/actions.ts`: `addPlantPhotoAction` also schedules `runPhotoChecks()` with `after()`;
  - `tests/integration/cron-route.test.ts`.
- Test: `tests/integration/cron-route.test.ts` (extend)

**Interfaces:** Consumes `runPhotoChecks` and `runPatternChecks` (Task 5).

- [ ] **Step 1: Write the failing test:** the cron tick response includes numeric `photoChecks` and `patternAlerts`. Then, with an unchecked photo on a plant named "Sick fern", one tick creates one open alert.
- [ ] **Step 2:** Run `npm run test:int -- cron-route`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:int`. Expected: all PASS.
- [ ] **Step 5:** Commit with `feat(gardener): run checks from cron and after new photos`.

---

### Task 8: UI: warning cards, the chat and entry points

**Files:**
- Create: `src/components/alert-card.tsx`, `src/components/chat-view.tsx`, `src/app/(app)/gardener/page.tsx`, `src/app/(app)/gardener/actions.ts`
- Modify: `src/app/(app)/page.tsx`, `src/app/(app)/plants/[id]/page.tsx`, `messages/*` (`gardener` namespace)
- Test: `e2e/gardener.spec.ts`

**Interfaces:**
- **Consumes:**
  - `openAlertsForUser`, `resolveAlert`
  - `getThread`, `listThreads`, `listMessages`, `sendMessage`, `acceptChatSuggestion`, `seedAlertMessage`, `chatPaused`
  - `PhotoCapture`'s downscale + upload approach, for chat photos
- **Produces:**
  - **Server actions**, each a thin wrapper with `requireUser` first, then `revalidatePath`:
    - `sendMessageAction(threadId, text, photoKey?)`
    - `acceptSuggestionAction(messageId)`, which maps results to a translated toast for `gone` / `same` / `already`
    - `resolveAlertAction(alertId, status)`
    - `askAboutAlertAction(alertId)`, which redirects to `/gardener?thread=<id>`
    - `applyAlertSuggestionAction(alertId)`, which calls `applySuggestion` for the alert's suggestion
  - **`/gardener` page:**
    - `?plant=<id>` opens (or creates) that plant's thread;
    - `?thread=<id>` opens a thread (404 if not the user's);
    - no params opens the general thread.
    - A list of the user's threads sits above the chat.
    - When `chatPaused()`, it shows `gardener.paused` and the input is disabled.
  - **`<AlertCard alert={AlertView} />`** (client, `data-testid="alert-card"`): the plant avatar, the "🩺" text, an optional suggestion button (e.g. "Water every 10 days" / "Move to Living room window"), and Done / Not now / Ask the gardener.
  - **`<ChatView>`** (client, `data-testid="chat-message"` per message): message bubbles, suggestion buttons that are disabled once applied or failed, a text input, a photo attach button, and a "thinking…" state while waiting.
  - **Home:** open alerts are rendered first under "Needs attention". The action buttons gain "🩺 Gardener" → `/gardener`.
  - **Plant page:** an "Ask the gardener" button → `/gardener?plant=<id>`.
- **Messages (`gardener`):**

  | Key | en |
  |---|---|
  | `title` | "Gardener" |
  | `askAbout` | "Ask the gardener" |
  | `placeholder` | "Ask about your plants…" |
  | `send` | "Send" |
  | `thinking` | "The gardener is thinking…" |
  | `paused` | "The gardener is back next month." |
  | `done` | "Done" |
  | `notNow` | "Not now" |
  | `waterEvery` | "{days, plural, one {Water every day} other {Water every # days}}" |
  | `moveTo` | "Move to {spot}" |
  | `applied` | "Done ✓" |
  | `gone` | "That spot no longer exists." |
  | `same` | "Already set." |
  | `general` | "General" |
  | `attachPhoto` | "Add a photo" |
  | `fallback` | "Sorry, I couldn't answer that right now. Try again in a moment." |

  The plural strings must start each branch with a non-word character, or match placeholders across locales, so `messages.test` ICU parity passes.
- [ ] **Step 1: Write the failing e2e** `e2e/gardener.spec.ts` (iPhone 14, `AI_MODE=mock`, logged in as Y):
  - **Chat and suggestion:** seed a YA plant "Fern …". Go to its page and tap **Ask the gardener**. Type "Should I water more?" and Send. A reply containing "[mock]" appears. Tap **Water every 10 days**. The button shows "Done ✓". The plant's edit page shows a watering override of 10.
  - **Warning card:** seed a YA plant "Sick fern …" with a photo task due today. Take a photo via the task card and pick "Nothing new". Within 10 s (`expect.poll`, reloading), an `alert-card` for that plant appears at the top of Needs attention. Tap **Done** and the card disappears.
- [ ] **Step 2:** Run `npm run test:e2e -- gardener`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:unit && npm run test:int && npm run test:e2e && npm run build`. Expected: all PASS, and check-css OK.
- [ ] **Step 5:** Commit with `feat: gardener chat, health warnings and entry points`.
