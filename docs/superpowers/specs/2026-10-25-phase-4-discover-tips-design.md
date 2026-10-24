# How Not To Kill Your Plants — Phase 4 "Discover & tips" Design

Notation: **[decided]** = said by Yann. **[my call]** = Claude's default, open to override. Unmarked = follows from the parent design or earlier phases.

Parent design: `docs/superpowers/specs/2026-10-24-plant-care-app-design.md` §9 (Discover) and §5 (tips). Earlier phases' decisions: `docs/superpowers/phase-1-followups.md`, `phase-2-followups.md`, and the Phase 3 design `2026-10-25-phase-3-gardener-design.md`, which provides the gardener's voice used by tips.

---

## 1. Intent

**Discover:** help pick the next plant *before* going to the shop, so it suits the apartment and the people. When Yann chose his plants he looked at these things **[decided]**:
- their look;
- what they bring to the home (he said "health properties");
- whether they can be used in cooking;
- whether they fit the home's environment;
- whether they are easy to care for.

Discover asks about those and suggests a few plants that fit.

**Tips:** short, useful advice that turns up *when it matters*, not a daily tip. **[decided]** "A tip only when it's actually useful."

## 2. Goals, non-goals, anti-goals

**Goals**
1. A Discover page that suggests about 5 plants for a chosen spot, effort level and wish (looks / benefits for the home / edible).
2. A personal wishlist. Buying a wishlist plant goes straight into the add-plant flow with the species filled in.
3. Event-driven tips from the gardener in the Plant news feed, plus a Tips page that collects them.

**Non-goals**
- **Shopping links, prices or store availability** (parent design non-goal).
- **In-shop use.** **[decided]** Discover is for browsing at home before shopping. No "snap a plant on the shelf" flow.
- **A daily tip.** **[decided]**
- **New task types for edible plants.** **[my call]** Edibles use the normal care schedule; harvesting advice lives in their care profile text.

**Anti-goals**
- **Myths presented as facts.** The "air-purifying plants" claim comes from sealed-chamber lab studies and has a negligible effect in a real home. Discover never presents it as a benefit. The real benefits it may mention: humidity, mood and wellbeing, scent, fresh herbs. It always states pet and child toxicity.
- **Suggestions that won't survive the spot.** Never suggest a plant whose light needs don't match the chosen spot.
- **Noisy tips.** Tips must not repeat, pile up, or crowd out plant news.
- **Chemical-first advice** (all phases).

## 3. Discover

### Input (all optional except the spot, prefilled where possible)
- **Spot [decided via parent design]:** pick an existing spot, which carries its light level and window direction, or describe a new one by window direction and distance from the window.
- **Effort [decided via parent design]:** easy / medium / devoted. Defaults to easy.
- **What you're after [decided]:** any mix of the following, plus optional free-text style words:
  - **Looks:** the style reference is the current collection by default (parent design).
  - **Good for the home:** humidity, wellbeing, scent, pet-safe.
  - **Edible:** herbs and edibles, e.g. basil, mint, rosemary, chili.

### Output
- About **5 suggestions**. Each one shows:
  - the species with its common name in the user's language;
  - **why it fits this spot** (light, size);
  - **how easy it is**;
  - **how it goes with the current plants** (style, or what's missing from the collection);
  - **honest benefits** (no air-purifying claims);
  - **pet / child safety**;
  - for edibles, **how to harvest** and how much to expect.
- **[my call]** No plant the user already has, unless they ask for it.
- **[my call]** No photos of suggested plants in Phase 4: only a text card, plus an emoji or a placeholder. Real plant images need an image source, which is out of scope.

### Wishlist
- **[decided via parent design]** Save any suggestion to a **personal** wishlist (per person).
- The wishlist shows the saved suggestions with their "why it fits" notes.
- **"I bought it"** opens add-plant with the species already filled in. Identification still runs on the photo, and the user can confirm or change it. The plant is then removed from the wishlist.
- The user can remove a wishlist item at any time.

### Cost
- **Model:** each Discover search uses `claude-sonnet-5-5` through the budgeted wrapper, as an *optional* feature. At the cap it shows "back next month".
- **Expected cost [my call]:** about 2–5 cents per search. **[my call]** Results are kept, so reopening Discover shows the last search without a new call; "Search again" makes a new one.

## 4. Tips

- **Only when useful [decided].** No daily tip.
- **Who writes them [my call]:** the gardener, the calm expert from Phase 3. They appear as a **"💡" post in Plant news**, styled differently from plant-voice posts. They don't go in "Needs attention", because a tip is advice, not a task.
- **What triggers a tip [my call]:**
  - **season turns:** going into the dormant season ("stop fertilizing, water less") and into the growing season ("time to fertilize and repot");
  - **a species new to the household** is added ("Monstera basics: …");
  - **a repot coming up** within a week ("what to use for a Pilea repot, organic soil mix");
  - **a care pattern** worth a gentle hint, for example "still moist" twice in a row ("check that the pot drains").

  This pattern hint is a softer, earlier signal than the gardener's warning in Phase 3, which starts at 3 in a row. A plant never gets both a tip and a warning about the same thing in the same week.
- **Frequency [my call]:** at most about **one tip per person per week**. A tip about a plant goes to the people in that plant's group. Each tip is shown once and never repeated.
- **Tips page [my call]:** lists every tip the user has received, newest first, grouped by plant (season tips under "Your home"). It replaces the parent design's "tip library".
- **Language:** tips are written in the reader's language.
- **Model and cost:** tips use `claude-haiku-5-5` (parent design §10), as an *optional* feature. At the cap, a short template version of the tip is shown instead.

## 5. How it's built
The stack and conventions are the same as earlier phases.

- **Wishlist:** the `wishlist_item` table already exists (user, species, name, reason). It may need a few additive columns, for example the stored suggestion details.
- **Tips:** a new table is likely, because tips are per person and not always about one plant. Its columns: user, optional plant, kind, trigger key for "never repeat", text per locale, created at. Tips show in the Plant news feed alongside plant posts.
- **Discover:** the last search per user is stored.
- **Strings:** all new UI strings in en / fr / pt-BR.

## 6. Left to the builder
- Prompt wording, and the exact rules and thresholds for each tip trigger beyond those listed above.
- How tips and plant posts are merged and ranked in the highlights. Big plant moments still come first.
- The Discover page layout.
- How the "current collection" style reference is summarized for the model.

## 7. Verification
- **Unit:**
  - tip triggers: a season turn, a new species, a repot within 7 days, the "still moist ×2" hint;
  - the weekly cap and never-repeat rule;
  - the rule that a plant never gets a tip and a gardener warning about the same thing in the same week.
- **Integration:**
  - Discover runs within the budget, works in mock mode, and doesn't suggest plants the user already has;
  - the wishlist is per user;
  - "I bought it" prefills add-plant and removes the item;
  - tips are visible only to the right people;
  - the template is used at the budget cap.
- **E2E (mobile, `AI_MODE=mock`):**
  - Run Discover for a spot, save a suggestion to the wishlist, tap "I bought it" and land in add-plant with the species prefilled.
  - A season change creates exactly one tip, visible in Plant news and on the Tips page.

## 8. Settled after the builder check [my calls]

### Discover
- **Suggestions don't create species.** Discover returns each suggestion's scientific name plus its card text in the user's language. No species row is created and no care profile is generated at search time.
- **"Already have" check:** suggestions are compared with the user's plants by normalized scientific name (the same normalization species use).
- **"I bought it"** passes the scientific name to add-plant. The species is created through the normal add-plant flow.
- **The wishlist** stores the full suggestion card as a snapshot, in the language it was written in: scientific name, common name, why it fits, ease, benefits, safety, harvest. If the user later switches language, saved cards stay in the original language.
- **Last search:** one stored search per user, with its inputs, results and language. A new search replaces it.
- **At the budget cap:** only *new* searches are blocked ("back next month"). The last search and the wishlist stay usable.

### Tips
- **Storage: one tip, several recipients.** A tip is stored once, with its kind, an optional plant, a category, a trigger key, and text in all three languages written in one call (or the template at the cap). It also lists its recipients: everyone in the plant's group, or every user for home-wide tips such as season turns. Each recipient sees it once.
- **Season tips** ride on the existing season-change step in the cron (Phase 2). They fire only when the growing season starts or ends, and they inherit its first-run baseline, so there's no tip on the first run after deploy. One home-wide tip goes to every user.
- **Weekly cap.** It is per recipient: a user gets at most one new tip per 7 days.
  - When several tips qualify, the order is:
    1. season turn
    2. repot coming up
    3. new species
    4. care pattern
  - Tips that don't win stay eligible and are retried the following week. Each expires 14 days after its trigger, which for a season tip is the season change.
  - The trigger key ("season:2027-spring", "repot:<task id>:<due date>", "species:<species id>", "moist:<plant id>:<week>") makes sure the same tip is never created twice.
- **Tips and gardener warnings.** Both carry a category from the Phase 3 list (`light`, `overwatering`, `underwatering`, `pests`, `nutrients`, `temperature`, `humidity`, `repot`, `other`).
  - **A warning blocks a tip:** no tip is created for a plant if a gardener warning with the same category is open for it, or was created in the last 7 days.
  - **A tip never blocks a warning:** a warning is the stronger, later signal.
  - The "still moist ×2" hint uses the category `overwatering`.
