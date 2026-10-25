# Phase 4 — Discover & Tips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two things:
- **Discover:** about 5 plant suggestions for a chosen spot, effort and wish, plus a personal wishlist whose "I bought it" goes straight into add-plant.
- **Event-driven tips** from the gardener, shown in Plant news and on a Tips page. They are capped at one new tip per person per week and never repeat.

**Architecture:**
- `src/lib/discover/`: a budgeted Sonnet call, the stored last search, and the wishlist.
- `src/lib/tips/`:
  - **triggers:** find the season, repot, new-species and pattern tips;
  - **creation:** a trigger-keyed `tip` row with recipients, and text written once in three languages by Haiku, or a template;
  - **delivery:** a weekly cap and a priority order per recipient, run from the cron.
- Tips merge into `feedForUser` as a new `tip` post kind.

**Tech Stack:** The same as Phases 1–3.

**Spec:** `docs/superpowers/specs/2026-10-25-phase-4-discover-tips-design.md`. Its §8 holds the settled builder answers and is binding. Phase 3's alert categories come from `docs/superpowers/specs/2026-10-25-phase-3-gardener-design.md` §9.

## Global Constraints

- **Discover:**
  - It is for browsing at home before shopping; there is no in-shop flow and no shop links or prices.
  - It suggests about 5 plants and never one the user already has. Comparison is by normalized scientific name (`normalizeScientificName`).
  - It never suggests a plant whose light needs don't match the chosen spot.
  - It never claims air purification. Benefits are limited to humidity, wellbeing, scent and fresh herbs. Pet and child safety is always stated.
  - Edibles include harvest notes.
- **Discover cost:** it uses `claude-sonnet-5-5` through `withBudget("discover", …)`, an optional feature. At the cap only *new* searches are blocked ("back next month"); the last search and the wishlist stay usable. One stored search per user replaces the previous one. Searches create no species and no care profiles.
- **Wishlist:** it is per person and saves the full card snapshot in the language it was written in. "I bought it" opens add-plant with the species filled in and removes the item once the plant is saved.
- **Tips:**
  - They come from the gardener, as "💡" posts in Plant news, and also go to a Tips page. They never go in "Needs attention" and never trigger a push.
  - **Triggers:**
    - a season turn into or out of the growing season;
    - a species new to the household, i.e. its first alive plant was added in the last 7 days;
    - a repot due within 7 days;
    - "still moist" twice in a row on the water task (category `overwatering`).
  - **Recipients:** everyone in the plant's group, or every user for home-wide season tips.
  - **Weekly cap:** at most one new tip per recipient per 7 days. Priority goes season > repot > species > pattern. Tips that don't win are retried and expire 14 days after their trigger. A trigger key makes each tip unique.
  - **Gardener warnings take precedence:** no tip for a plant while a gardener alert with the same category is open, or was created in the last 7 days. A tip never blocks a warning.
- **Tip text:** `claude-haiku-5-5` (no server-side fallback), optional feature `tips`, written in all three languages in one call. At the cap or on failure, a template is used instead.
- **Highlights order:** big plant moments, then tips, then routine posts.
- **Text and mock mode:**
  - All new strings in `en`, `fr` and `pt-BR`.
  - `AI_MODE=mock` is deterministic and offline. The Discover mock returns 5 fixed suggestions: Zamioculcas zamiifolia, Calathea orbifolia, Ocimum basilicum (edible), Peperomia obtusifolia and Chlorophytum comosum.

## Review Focus

1. **The user already owns one of the model's suggestions, possibly under a cultivar name such as "Ficus elastica 'Tineke'".** It is filtered out. *Pinned in Task 2.*
2. **Two triggers for the same person in the same week (a season turn and a repot).** Only one tip is shown that week, the other the next week, and nothing is shown twice. *Pinned in Task 6.*
3. **"I bought it", then the add-plant flow is abandoned.** The wishlist item stays; it is removed only when the plant is actually saved, and only from the buyer's own wishlist. *Pinned in Task 3 and Task 4.*
4. **A tip's plant moves out of a user's groups, or dies.** The user no longer sees that plant's tips in the feed. *Pinned in Task 7.*
5. **The budget is spent.** Discover shows "back next month" with the last search still visible, and tips still appear with template text. *Pinned in Task 2 and Task 5.*

---

## File Structure

```
src/db/schema.ts                     # + discover_search, tip, tip_recipient; wishlist_item.scientificName/card; tip enums
drizzle/0003_*.sql
src/lib/discover/types.ts            # DiscoverInput, Suggestion card types (no DB)
src/lib/discover/search.ts           # runDiscover(), lastSearch(), mock, prompt
src/lib/discover/wishlist.ts         # saveWish(), listWishes(), removeWish(), consumeWish()
src/lib/tips/triggers.ts             # findTipCandidates() + gardener-block rule
src/lib/tips/create.ts               # createTip() (trigger key, recipients, Haiku texts / template)
src/lib/tips/deliver.ts              # deliverTips()
src/lib/tips/queries.ts              # tipsForUser()
src/lib/feed/cron.ts                 # runSeasonChanges creates the season tip
src/lib/feed/queries.ts              # tips merged into the feed
src/lib/feed/highlights.ts           # tier: big > tip > routine
src/app/api/cron/tick/route.ts       # + tips step
src/app/(app)/discover/{page,actions,discover-form}.tsx|ts
src/app/(app)/wishlist/page.tsx
src/app/(app)/tips/page.tsx
src/app/(app)/plants/new/*           # ?species=&wish= prefill, consumeWish on save
src/components/feed-post.tsx         # tip variant
messages/{en,fr,pt-BR}.json          # `discover`, `tips` namespaces
```

---

### Task 1: Schema

**Files:**
- Modify: `src/db/schema.ts`, `tests/unit/messages.test.ts` (add `discover` and `tips` to the namespace list), `messages/*` (seed both namespaces with `title`)
- Create: `drizzle/0003_*.sql`, `src/lib/discover/types.ts`
- Test: `tests/integration/schema.test.ts` (extend)

**Interfaces:**
- **Schema:**
  - `tipKind` enum: `season | repot | species | pattern`.
  - `discoverSearch` table:

    | Column | Type |
    |---|---|
    | `id` | uuid |
    | `userId` | text, unique, FK cascade |
    | `input` | jsonb |
    | `results` | jsonb |
    | `locale` | text |
    | `createdAt` | timestamp |

  - `wishlistItem` gains `scientificName` (text, nullable) and `card` (jsonb, nullable).
  - `tip` table:

    | Column | Type |
    |---|---|
    | `id` | uuid |
    | `kind` | `tipKind` |
    | `plantId` | uuid, nullable, FK cascade |
    | `category` | `alertCategory`, nullable |
    | `triggerKey` | text, unique |
    | `texts` | jsonb `{en,fr,"pt-BR"}`, nullable until written |
    | `params` | jsonb, for templates |
    | `triggeredAt` | timestamp |
    | `createdAt` | timestamp |

  - `tipRecipient` table: `tipId` (FK cascade), `userId` (FK cascade), `shownAt` (timestamp, nullable; null means queued). Primary key (`tipId`, `userId`).
- **`@/lib/discover/types`:**
  - `type Effort = "easy" | "medium" | "devoted"`
  - `type Want = "looks" | "home" | "edible"`
  - `type DiscoverInput = { spotId: string | null; newSpot: { windowDirection: "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW"|"none"; distance: "close"|"middle"|"far" } | null; effort: Effort; wants: Want[]; style: string }`
  - `type DiscoverCard = { scientificName: string; commonName: string; whyItFits: string; ease: string; goesWith: string; benefits: string; safety: string; harvest: string | null }`
- [ ] **Step 1:** In `schema.test.ts`, inserting the same `tip.triggerKey` twice rejects with 23505, and a new `tip_recipient` has `shownAt` null.
- [ ] **Step 2:** Run `npm run test:int -- schema`. Expected: FAIL.
- [ ] **Step 3:** Implement and generate the migration.
- [ ] **Step 4:** Run `npm run test:int` and `npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(db): discover, wishlist cards and tips`.

---

### Task 2: Discover search

**Files:**
- Create: `src/lib/discover/search.ts`
- Test: `tests/integration/discover.test.ts`

**Interfaces:**
- **Consumes:** `withBudget`, `callStructured`, `monthSpend`, `normalizeScientificName`, `listPlantsForUser`, `householdContext` (Phase 3: spots, plants, season).
- **Produces:**
  - **`DiscoverResult`** zod schema: `{ suggestions: DiscoverCard[] }`.
  - **`discoverPaused(): Promise<boolean>`**
  - **`runDiscover(userId: string, input: DiscoverInput, deps?: { call?: (i) => Promise<StructuredOutput> }): Promise<{ status: "ok"; cards: DiscoverCard[] } | { status: "paused" } | { status: "error" }>`**:
    - It validates the input with zod. `spotId` must exist if given.
    - Paused means no call.
    - It calls Sonnet with `maxTokens: 16_000`. The user turn includes the spot (light level and window direction), the wants, the style words, the household's current plants and the season, and the user's locale.
    - It drops cards whose normalized scientific name matches any of the user's plants, then keeps the first 5.
    - It upserts `discover_search` for the user with the input, the result cards and the locale.
    - A failure returns `"error"`, and the previous search is kept.
  - **`lastSearch(userId: string): Promise<{ input: DiscoverInput; cards: DiscoverCard[]; locale: Locale; createdAt: Date } | null>`**
- [ ] **Step 1: Write the failing tests**, in `AI_MODE=mock`:
  - **5 cards:** `runDiscover` returns 5 cards, and `lastSearch` returns them.
  - **Owned plants are dropped:** the user owns a plant whose species is "Zamioculcas zamiifolia 'Raven'". The result then has no card whose name normalizes to "zamioculcas zamiifolia" (Review Focus 1).
  - **The budget is spent:** `runDiscover` returns `{status:"paused"}`, the injected call is not invoked, and `lastSearch` still returns the earlier search (Review Focus 5).
  - **The model fails:** an injected call that throws returns `"error"`, and the previous search is unchanged.
  - **Searches are per person:** Y's search doesn't show up for M.
- [ ] **Step 2:** Run `npm run test:int -- discover`. Expected: FAIL.
- [ ] **Step 3:** Implement. The system prompt is a constant:
  - use the light rules;
  - make no air-purifying claims;
  - give pet and child safety;
  - give harvest notes for edibles, `null` otherwise;
  - write in the user's language;
  - use real, widely sold species.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(discover): budgeted plant suggestions`.

---

### Task 3: Wishlist

**Files:**
- Create: `src/lib/discover/wishlist.ts`
- Test: `tests/integration/wishlist.test.ts`

**Interfaces:**
- **Produces:**
  - **`saveWish(userId: string, card: DiscoverCard): Promise<string>`**: stores `name` = commonName, `reason` = whyItFits, `scientificName`, and `card`. Saving the same scientific name twice for a user returns the existing id.
  - **`listWishes(userId: string): Promise<{ id: string; card: DiscoverCard; createdAt: Date }[]>`**: newest first.
  - **`removeWish(userId: string, wishId: string): Promise<void>`**: only the owner can remove an item; anyone else gets `notFound()`.
  - **`wishForUser(userId: string, wishId: string): Promise<{ id: string; scientificName: string; commonName: string } | null>`**
  - **`consumeWish(userId: string, wishId: string): Promise<void>`**: deletes the item only if it belongs to the user. Otherwise it does nothing and doesn't throw.
- [ ] **Step 1: Write the failing tests:**
  - Saving the same card twice gives 1 row.
  - `listWishes(M)` doesn't include Y's items.
  - `removeWish(M, yWish)` gives a 404.
  - `consumeWish(M, yWish)` leaves the item in place.
  - `consumeWish(Y, yWish)` removes it.
- [ ] **Step 2:** Run `npm run test:int -- wishlist`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(discover): personal wishlist`.

---

### Task 4: Discover UI, wishlist and add-plant prefill

**Files:**
- Create: `src/app/(app)/discover/page.tsx`, `src/app/(app)/discover/discover-form.tsx` (client), `src/app/(app)/discover/actions.ts`, `src/app/(app)/wishlist/page.tsx`
- Modify:
  - `src/app/(app)/plants/new/page.tsx`: reads `?species=` and `?wish=`;
  - `src/app/(app)/plants/new/add-plant-form.tsx`: accepts `prefill: { scientificName: string; wishId: string } | null`;
  - `src/app/(app)/plants/new/actions.ts`: `createPlantAction` takes an optional `wishId` and calls `consumeWish` after a successful save;
  - `src/app/(app)/page.tsx`: adds "Discover" and "Wishlist" action buttons;
  - `messages/*`.
- Test: `e2e/discover.spec.ts`

**Interfaces:**
- **Server actions** (thin, `requireUser` first):
  - `runDiscoverAction(input)`
  - `saveWishAction(card)`
  - `removeWishAction(id)`
- **Pages:**
  - **`/discover`:** the form, then the last search's cards, each with **Save to wishlist**. While the budget is spent, it shows `discover.paused` and the last search stays visible.
  - **`/wishlist`:** saved cards, each with **I bought it** (→ `/plants/new?species=<scientificName>&wish=<id>`) and **Remove**.
- **Prefill:**
  - **The form:** with `prefill`, identification still runs. If a candidate's normalized name matches the prefill, it is preselected. Otherwise "Something else" is preselected with the prefilled scientific name as its text.
  - **On save:** if the species saved matches the prefill, `wishId` is sent. The item is removed only after the plant is saved (Review Focus 3).
- **Messages:** `discover.*` covers:
  - form labels: spot, a new spot's window direction and distance, effort levels, wants, style;
  - Search, Save to wishlist, Saved, paused ("Discover is back next month.");
  - card section labels: Why it fits, Ease, Goes with, Benefits, Safety, Harvest;
  - Wishlist, I bought it, Remove, empty states.

  Real fr / pt-BR translations.
- [ ] **Step 1: Write the failing e2e** (`AI_MODE=mock`, as Y):
  - Open `/discover`, pick the seeded spot "Living room window" and tap **Search**. 5 cards appear.
  - **Save** "Calathea orbifolia". `/wishlist` shows it.
  - Tap **I bought it**. Add-plant opens with the species prefilled. Upload `pilea.jpg`. "Something else" is selected with "Calathea orbifolia". Save.
  - `/wishlist` no longer lists Calathea.
- [ ] **Step 2:** Run `npm run test:e2e -- discover`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:e2e -- discover add-plant`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(discover): discover page, wishlist and buy-to-add`.

---

### Task 5: Tip triggers and creation

**Files:**
- Create: `src/lib/tips/triggers.ts`, `src/lib/tips/create.ts`
- Modify: `messages/*` (`tips.template.<kind>` and `tips.title`)
- Test: `tests/integration/tips-create.test.ts`

**Interfaces:**
- **Consumes:** `withBudget`, `callStructured` (with `fallback: false`), `gardenerAlert`, `visibleGroupIds` / group members, `isGrowing`.
- **Produces:**
  - **`type TipCandidate = { kind: "season" | "repot" | "species" | "pattern"; plantId: string | null; category: AlertCategory | null; triggerKey: string; params: Record<string, string | number>; recipients: string[] }`**
  - **`findTipCandidates(today: string): Promise<TipCandidate[]>`**. Season tips are not found here; `runSeasonChanges` creates them (Task 6). It finds:

    | Kind | Condition | Trigger key | Params |
    |---|---|---|---|
    | `repot` | active repot tasks with `dueOn` from today to today+7 | `repot:<taskId>:<dueOn>` | `{plant, dueOn}` |
    | `species` | species whose earliest alive plant in the home was created in the last 7 days | `species:<speciesId>` | `{plant, species}` |
    | `pattern` | plants whose last two water completions are `still_moist` | `moist:<plantId>:<ISO week>` | `{plant}` |

    - Plant tips go to the members of the plant's group. The `species` tip goes to that first plant's group.
    - A `pattern` candidate has category `overwatering`.
    - A candidate is dropped when its plant has a gardener alert with the same category that is open, or was created in the last 7 days.
  - **`createTip(c: TipCandidate, deps?): Promise<string | null>`**:
    - It inserts a `tip` (`onConflictDoNothing` on `triggerKey`; null if it already exists) and one `tip_recipient` per recipient.
    - It then writes the texts with Haiku (`withBudget("tips", …)`, `maxTokens` 4000, a 30 s timeout, 1 retry) in all three languages.
    - On budget, failure or refusal, `texts` stays null and the template is used at render time.
  - **`renderTipText(tip: { kind; texts; params }, locale: Locale): string`**
- **Templates (en)**, each starting with "💡":

  | Kind | Template |
  |---|---|
  | `season` | "💡 {growing, select, true {Growing season: time to feed and repot.} other {Rest season: water less, stop fertilizing.}}" |
  | `repot` | "💡 {plant} needs a repot soon: use an airy organic mix and a pot one size up." |
  | `species` | "💡 New in the family: {species}. Check its care page for light and watering." |
  | `pattern` | "💡 {plant}'s soil stayed moist twice: make sure the pot drains well." |

- [ ] **Step 1: Write the failing tests:**
  - **Repot:** a repot task due in 3 days gives one `repot` candidate for the group members, and `createTip` called twice creates one tip.
  - **Species:** a new species added yesterday gives a `species` candidate. A species that already had an older plant gives none.
  - **Pattern:** two `still_moist` water completions in a row give a `pattern` candidate (`overwatering`). With an open gardener alert of category `overwatering` on the plant, there is no candidate.
  - **Budget:** with the budget spent, `createTip` stores the tip with `texts` null, and `renderTipText(…, "fr")` returns the French template (Review Focus 5).
- [ ] **Step 2:** Run `npm run test:int -- tips-create`. Expected: FAIL.
- [ ] **Step 3:** Implement. The mock returns `"[mock en] tip <kind>"`, and the same for the other locales.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(tips): triggers and tip creation`.

---

### Task 6: Tip delivery and cron

**Files:**
- Create: `src/lib/tips/deliver.ts`
- Modify:
  - `src/lib/feed/cron.ts`: `runSeasonChanges` also creates a season tip when the growing state flips. Trigger key `season:<year>-<season>`, all users as recipients, params `{growing}`.
  - `src/app/api/cron/tick/route.ts`: a `tips` step after the digests that runs `findTipCandidates` + `createTip` + `deliverTips`.
- Test: `tests/integration/tips-deliver.test.ts`, `tests/integration/cron-route.test.ts` (extend)

**Interfaces:**
- **Produces:** `deliverTips(now: Date): Promise<number>`. For each user with queued recipients:
  - if a tip was already shown to them in the last 7 days, skip;
  - otherwise show the highest-priority queued tip whose `triggeredAt` is within 14 days (priority season > repot > species > pattern, then oldest), by setting `shownAt`;
  - queued tips older than 14 days are never shown.

  It returns the number shown.
- [ ] **Step 1: Write the failing tests:**
  - **Two tips in one week (Review Focus 2):** a queued season tip and a queued repot tip for Y. `deliverTips` shows the season tip. Run again the same day: 0. Run 7 days later: the repot tip is shown, if it is within 14 days of its trigger.
  - **Expiry:** a queued tip 15 days old is never shown.
  - **Season:** a season flip in `runSeasonChanges` creates exactly one season tip with every user as recipient. The first-run baseline creates none.
  - **Cron:** the cron tick response includes a numeric `tipsShown`.
- [ ] **Step 2:** Run `npm run test:int -- tips-deliver feed-cron cron-route`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(tips): weekly delivery and season tips`.

---

### Task 7: Tips in the feed and the Tips page

**Files:**
- Create: `src/lib/tips/queries.ts`, `src/app/(app)/tips/page.tsx`
- Modify:
  - `src/lib/feed/queries.ts`: `FeedPost` gains `kind: "plant" | "tip"`, and `plant` is nullable for home-wide tips. `feedForUser` merges in the user's shown tips (`shownAt` set) for alive plants still in the user's groups, plus home-wide tips.
  - `src/lib/feed/highlights.ts`: ranks big plant moments first, then tips, then routine posts.
  - `src/components/feed-post.tsx`: a tip variant with a 💡 avatar and the title "Gardener".
  - `src/app/(app)/page.tsx`: adds a "Tips" action button.
  - `messages/*`.
- Test: `tests/integration/tips-feed.test.ts`, `tests/unit/highlights.test.ts` (extend), `e2e/tips.spec.ts`

**Interfaces:**
- **Produces:**
  - **`tipsForUser(userId: string, locale: Locale): Promise<{ id: string; kind: TipKind; plant: { id: string; name: string } | null; text: string; shownAt: Date }[]>`**: shown tips only, newest first. Tips of plants the user can no longer see (dead, or no longer in their groups) are excluded.
  - **`/tips`:** tips grouped by plant, with home-wide ones under `tips.home` ("Your home").
- [ ] **Step 1: Write the failing tests:**
  - **Highlights:** a big moment ranks above a tip, and a tip ranks above a thanks post.
  - **Moved or dead plants (Review Focus 4):** a shown tip appears in Y's feed and on the Tips page. After its plant moves to M's group, Y no longer sees it. A home-wide tip is visible to everyone it was shown to.
  - **e2e** (`AI_MODE=mock`, as Y): seed a shown home-wide season tip for Y. Home → Plant news contains "💡". The Tips page lists it under "Your home".
- [ ] **Step 2:** Run `npm run test:unit -- highlights && npm run test:int -- tips-feed && npm run test:e2e -- tips`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite: `npm run test:unit && npm run test:int && npm run test:e2e && npm run build`. Expected: all PASS.
- [ ] **Step 5:** Commit with `feat(tips): tips in plant news and a tips page`.
