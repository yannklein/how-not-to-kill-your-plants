# How Not To Kill Your Plants — Phase 2 "Personality" Design

Notation: **[decided]** = said by Yann. **[my call]** = Claude's default, open to override. Unmarked = direct consequence of the above or of the Phase 1 design.

Parent design: `docs/superpowers/specs/2026-10-24-plant-care-app-design.md` (§7 "Plants as characters", §11 phase 2). Phase 1 is built and deployed (Coolify, `plants.yannklein.dev`); its rulings and deferred issues are in `docs/superpowers/phase-1-followups.md`.

---

## 1. Intent

Phase 1 made the app useful: it knows the plants, schedules care, and reminds the right people. Phase 2 makes it charming. Each plant becomes a little character with a voice, a mood and its own news. The goal is that Yann, Adriana and Marcela open the app in the morning partly *because they want to*: to see a new leaf, a cheeky complaint about the radiator, or who watered the fern.

It is a 3-person personal app. **[decided]** It doesn't have to be perfect from the start; it is fine to ship, use, and adjust.

## 2. Goals, non-goals, anti-goals

**Goals**
1. A "Plant news" feed on the home screen, written in each plant's own voice.
2. A mood for every plant, derived from its care, shown on its avatar.
3. Growth moments (new leaf, new growth, flower, repotted) logged in one tap.
4. A monthly photo reminder and a photo timeline per plant.
5. Birthdays.

**Non-goals (Phase 2)**
- Points, streaks, badges, leaderboards **[decided in Phase 1: personality, not rewards]**.
- AI-generated or illustrated avatars (the avatar is the plant's own photo).
- Comments, reactions or likes on posts.
- The AI gardener chat (Phase 3), Discover and tips (Phase 4).

**Anti-goals**
- **Noise.** A feed buried in routine posts, or any extra push notifications. **[decided]** Posts never send a push.
- **Data entry.** Moments and photos must stay one or two taps (the Phase 1 #1 anti-goal still holds).
- **Personality drowning the care information.** "Needs attention" stays first and unchanged in spirit.

## 3. Plant news (the feed)

### Placement and volume
- Home screen, below "Needs attention", above the action buttons (Phase 1 §4 order).
- **Highlights only [decided]**: a few recent posts, best moments first, with a "See all" link to the full chronological list.
- **[my call]** Highlights = posts from the last 3 days, max 5. Big moments rank above routine ones; ties by recency. If there are none in 3 days, show the latest 3 posts whatever their age (so the section is never empty once a plant has any history); with no posts at all, hide the section.
  - **Big moments**: birthday, flower, new leaf, new growth, repotted, a new photo, the first post a plant ever gets.
  - **Routine**: thanks for care, mood changes, season changes.
- "See all" page: every post visible to the user, newest first, paginated.

### Who sees what
- **[decided]** Each person sees only posts about plants in their own groups (same rule as tasks, via Phase 1 access control). Dead / given-away plants' posts drop out like their tasks do.

### What a post looks like
- The plant's round avatar with its mood face, the plant's name, the text in the plant's voice, an optional photo, and a relative time ("2 h ago").
- Tapping a post opens the plant's page.

### Voice and tone
- **[decided]** Affectionate and a little cheeky, each plant in its own character. Yann approved this sample set as the target tone:
  - Strelitzia (dramatic diva), new leaf: "A new leaf. Unfurling slowly, as all great art does. You may applaud. 🌿✨"
  - Pachira (easygoing), watered by Marcela: "Thanks for the drink, Marcela 💧 Feeling good, no notes."
  - Pilea, 1 month: "One month in this apartment! I've grown 2 new leaves and zero complaints. Well, one complaint. The radiator."
  - Ficus elastica, sulking: "I'm not saying I'm thirsty. I'm just saying the soil has become a desert and nobody has asked how I am. 🏜️"
  - Monstera, winter: "Going into winter mode 😴 Water me less, don't move me, and wake me up in March."
  - Braided Ficus, photo reminder: "It's been a month since my last portrait. I've been working on my look. Come see. 📸"
  - Asparagus fern, new photo: "Glow-up check: +4 cm since September. Adriana caught my good side."
- Posts are short (one to three sentences), can use an emoji, never give care instructions that contradict the care profile, and recommend only organic/non-chemical options if they mention any product.

### Post types and when they are created
Each post is a `feed_event` stored once in neutral form (type + payload); its text is generated per language.

| Type | Trigger | Notes |
|---|---|---|
| `thanks` | A care task is completed (done / still moist / root-bound answers) | **[my call]** At most one per plant per day; credits the person who completed it. Skips are not thanked. |
| `moment` | A moment is logged (new leaf, new growth, flower, repotted) | Big moment. Includes the photo if one was attached. |
| `photo` | A photo is added to a plant (photo task, "Something new?" flow, or the profile) | Big moment. **[my call]** If an older photo exists, the text may compare (e.g. "glow-up since September"). |
| `birthday` | 1 month after the plant joined the app, then every year | Big moment. |
| `mood` | Mood changes **into** sulking or **out of** sulking | **[my call]** Only these transitions post, to avoid noise. |
| `season` | The home's season changes (spring/summer/autumn/winter) | **[my call]** One post per plant at most per season change, only for plants whose care actually changes (entering or leaving the growing season). |
| `first` | A plant is added | Big moment: a short self-introduction in its voice. |

"Joined the app" = the plant row's creation date **[my call]** (for just-bought plants this equals the purchase date anyway).

**One action → one post [my call].** When a single action produces several events, only the most meaningful one becomes a post. Precedence: `moment` (with the photo attached if there is one) > `photo` > `thanks`. Examples:
- Photo task completed + "New leaf" picked → one `moment` post with the photo.
- Photo task completed + "Nothing new" → one `photo` post.
- Repot task completed → one `moment` ("repotted") post; no `thanks`.
- Watering completed → one `thanks` post (subject to the once-per-plant-per-day rule).
Photo tasks themselves are never thanked; skips are never posted.

**Existing plants at Phase 2 deploy [my call].** The plants added during Phase 1 do **not** get `first` self-introduction posts (that would flood the highlights on day one). Their mood baseline is set at deploy so the first cron tick doesn't post spurious mood changes, and the current season is recorded as already announced. Their birthdays count from their creation date (≈ 24 Nov 2026 for the 1-month post).

**Mood face on a post [my call].** The post shows the mood the plant had when the event happened (stored in the event payload), so old posts don't change face. The avatar everywhere else shows the current mood.

**Undo [my call].** The person who logged a moment can delete it from the plant page (a mis-tapped "Flower"); deleting it removes its post too. No other editing or deleting of posts.

### Languages and generation
- **[decided in Phase 1]** Each reader sees posts in their own language (en / fr / pt-BR). The text of an event is generated once per language by `claude-haiku-5-5`, then stored in `feed_text` (keyed by event + locale) and reused.
- Input to the model: the plant's name, species, personality (summary + traits), mood, the event type and payload (who, which moment, ages, dates), and the target language. **[my call]** The plant's personality is stored in the creator's language; the model writes in the reader's language regardless.
- **Budget [decided in Phase 1]**: feed text is an *optional* AI feature. When the monthly cap is reached, or the call fails, the app shows a plain template in the reader's language instead (e.g. "Pilea got watered by Marcela 💧", "🌱 Monstera has a new leaf!"). Templates live in the message files.
- **[my call]** Text is generated in the background right after the event is created (all three languages in one call is fine), with the 15-minute cron filling any gaps. The feed never waits on the model: if a text isn't ready yet, the template shows.

## 4. Personality, avatar and mood

### Name and personality
- Plants already have a name and a personality (summary + 3 traits) suggested by the AI at add time; the 10 existing plants keep theirs.
- The plant edit page gains fields to edit the personality summary and traits.
- **[my call]** Plants without a personality (e.g. added while identification failed) get one generated in the background the first time a post needs it (same Haiku model, optional feature, template-safe).

### Avatar
- A round crop of the plant's latest photo with a small mood-face badge. No photo → a leaf placeholder.
- Used on the feed, task cards, the plant list and the plant page.

### Mood (derived, never entered)
| Mood | Rule (first match wins) |
|---|---|
| 🥳 proud | A moment logged in the last 3 days **[my call: 3 days]** |
| 😤 sulking | Any active task more than 3 days overdue **[my call: 3 days]** |
| 🥵 thirsty / needy | Any active task due today or overdue |
| 😴 sleepy | Dormant season and nothing due |
| 😊 happy | Otherwise |

**[my call]** Only care that matters for the plant's health counts toward "needy" and "sulking": **water, settle check, repot and fertilize**. Photo, rotate, dust and mist tasks never make a plant needy or sulky (an ignored portrait reminder shouldn't make it sulk).

Mood is computed on read from the plant's tasks, moments and the home's season. Mood-change posts need the previous mood: **[my call]** store the last posted mood on the plant (or derive from the latest `mood` event) and check transitions in the cron tick.

## 5. Photos and moments

### Which photos count **[my call]**
Photos get a kind: **plant** or **label** (a small additive column; existing photos are treated as plant photos, except that add-plant's label photo slot is marked label from now on). Label photos are kept for identification only: they are never the cover or avatar, not on the timeline, not in compare, and don't reset the portrait reminder. "The plant's latest photo" always means the latest *plant* photo. The photos taken when adding a plant count as its first portrait (no separate `photo` post; the `first` post covers it), so the first portrait reminder is due a month after adding.

### Monthly portrait
- **[decided]** A `photo` task appears in "Needs attention" like any care task, with **Take photo** and **Skip**.
- Due one month after the plant's latest photo, whatever its source; a new photo from any source pushes it out. Skip → due again in a month **[my call]**.
- Existing plants get a photo task when Phase 2 is deployed (backfill like Phase 1's R18).
- "Take photo" opens the camera, uses the same downscale + upload path as add-plant, and completes the task.

### Timeline
- The plant page shows all photos newest first, and a **compare** view with the first and the latest photo side by side **[my call: first vs latest]**.
- The cover photo becomes the latest photo automatically.

### Growth moments
- **[decided]** A "Something new? 🌱" button on the plant page with one-tap choices: New leaf · New growth · Flower · Repotted.
- **[decided]** The same choices ("New leaf / New growth / Flower / Nothing new") appear right after any photo is taken, so a moment can be logged with the photo attached.
- **[decided]** Completing a repot task logs a "repotted" moment automatically.
- Each moment becomes a big-moment post.

### Birthdays
- Post at 1 month after joining, then every yearly anniversary.
- **[my call]** The morning push stays about care, plus one extra line when one of the user's plants has a birthday or logged a first flower that day (e.g. "🎂 It's Strelitzia's birthday today"). No push for anything else.

## 6. How it's built

Same stack and conventions as Phase 1 (Next.js 16, Drizzle/Postgres, MinIO, Anthropic SDK, next-intl, Vitest/Playwright, Coolify). Phase 1's schema already has `moment`, `feed_event` and `feed_text`; Phase 2 should need at most small additive columns (e.g. last posted mood). All AI text uses `claude-haiku-5-5` through the existing budgeted wrapper as an optional feature. New UI strings in en / fr / pt-BR.

## 7. Left to the builder
Prompt wording (matching the sample tone), exact highlight ranking weights, the template wording, avatar badge styling, pagination size, how event creation hooks into existing completion/photo/plant-creation code, and whether text is generated per event or batched.

## 8. Verification
- Unit tests: mood rules, highlight selection, birthday dates, thanks de-duplication, photo-task due dates.
- Integration: posts are only visible within the reader's groups; templates are used when the budget is exhausted or the model fails; feed text is cached per locale.
- E2E (mobile viewport, `AI_MODE=mock`): log a moment from the plant page and see it in the feed; complete a photo task with "New leaf" and see one post with the photo.
- Manual: a week of real use by the three of them; adjust tone and volume.
