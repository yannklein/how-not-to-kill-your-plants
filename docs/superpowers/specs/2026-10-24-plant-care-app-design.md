# How Not To Kill Your Plants — Design


Notation: **[decided]** = said by Yann. **[my call]** = Claude's default, open to override. Unmarked = direct consequence of the above.

---

## 1. Intent

Yann, Adriana and Marcela have just bought about ten houseplants and will buy more, and they want to stop killing them. The app should:

- know what each plant is and what it needs
- tell the right people when to act
- make caring fun by turning each plant into a character with a name, a personality, a mood and its own news

Success means the plants are alive and growing a year from now, and all three people still open the app every morning because it's quick and charming, not a chore.

### Starting collection: 10 plants, one Barcelona apartment, indoors [decided]
| Group | Plant | Notes |
|---|---|---|
| Yann + Adriana | Pilea peperomioides | 12 cm pot |
| Yann + Adriana | Ficus elastica (rubber plant) | |
| Yann + Adriana | Ficus ginseng (F. microcarpa) | |
| Yann + Adriana | Pachira (money tree) | Mondo Verde, ceramic cover pot |
| Yann + Adriana | Asparagus fern | |
| Marcela | Ficus elastica | |
| Marcela | Ficus ginseng | |
| Marcela | Monstera deliciosa | |
| All three: living/dining room | Strelitzia nicolai (giant bird of paradise) | 27 cm pot |
| All three: living/dining room | Braided Ficus (likely F. benjamina) | 24 cm pot. **[my call]** Yann said "the other two"; I took them to be the Strelitzia and the braided Ficus. |

The two Ficus elastica labels (P17 at €12.99, and a 24 cm braided "Ficus mix") may not map to the owners exactly as above. Seeding goes through the normal add-plant flow anyway, so the owners can fix it then.

## 2. Users and sharing
- **Three accounts [decided]:** Yann, Adriana, Marcela. Each person has their own login. Accounts are invite-only, with no public sign-up **[my call]**.
- **Plants belong to a group [decided].** A group says who owns and cares for a plant. Today there are three groups: Yann + Adriana, Marcela alone, and all three. A person can be in several groups.
- **One home [decided].** All three live in the same Barcelona apartment, and every plant is indoors. **[my call]** The app has one home with a location (Barcelona, northern hemisphere, editable), which drives the seasons. Rooms or spots (with their light) belong to the home and are shared by every group. Supporting several homes later is cheap but not in v1.
- **Shared tasks [decided]:** everyone in the plant's group sees a due task. The first person to tick it off clears it for everyone and gets credited, for example in a "thanks Adriana 💧" post.
- **Language [decided]:** each user picks English, French or Brazilian Portuguese. Interface text and AI-written plant messages appear in the reader's language.

## 3. Goals, non-goals, anti-goals

**Goals**
1. Identify a plant from a photo of the plant or its label, and generate its care profile.
2. Schedule and remind about watering, repotting (after purchase and as it grows), fertilizing, misting, rotating, cleaning leaves and photo-taking.
3. Organic or non-chemical fertilizer and pest advice first.
4. General plant-care tips.
5. Plants as characters: name, personality, mood, birthday, growth moments, regular photos, a news feed.
6. Personal AI gardener chat that knows every plant's full context.
7. Discover new plants to buy, matched to a spot's light, the care effort wanted, and the style of the current plants.
8. Care events appear in each user's own calendar (Google or Apple).
9. Mobile-first installable PWA, with a path to a native app later.

**Non-goals (v1)**
- A native app store release (it stays possible later through Capacitor).
- Two-way calendar sync: ticking off happens in the app **[decided: one-way]**.
- Points, streaks, badges or leaderboards between people **[decided: personality, not rewards]**.
- Shopping or affiliate links, IoT and moisture sensors, and social features beyond the three users.

**Anti-goals: failure even if the app works**
- **Too much data entry [decided, the #1 deal-breaker].** The usual flows need nothing but a photo and taps. No mandatory forms beyond a plant's name, and the AI suggests that too. If adding a plant takes more than about 30 seconds, it has failed.
- Pushing synthetic or chemical products as the default advice.
- Nagging: a flood of pushes or one calendar event per plant per day **[my call: see §6]**.
- Plant personalities that drown out the actual care information.

## 4. Key screens

### Home, the "morning screen" [decided]
1. **Needs attention:** today's and overdue tasks for plants in the user's groups, grouped by plant. Each task has one-tap actions.
2. **Plant news:** a feed of plant-voiced posts, such as birthdays, "first new leaf!", "here's my latest photo", "thanks for the water, Marcela", and a mood change.
3. **Action buttons:** Add plant · My plants · AI gardener · Discover · Tips.

### Other screens
- **Plant profile:** the avatar and mood, name and personality, species and care summary, upcoming tasks, a photo timeline (growth over time, with a side-by-side compare), moments, and a "chat with gardener about this plant" button.
- **Add plant:** take a photo of the plant and/or its label. The AI returns a species, a confidence level, a suggested name and a personality. Confirm, pick a group and a spot, and you're done. It also asks "just bought?" (default yes) and the pot size if it's visible on the label, otherwise it's optional.
- **Gardener chat**, **Discover**, **Tips**, and **Settings** (language, push time, calendar link, groups and spots).

## 5. Care engine

- **Species care profile:** generated by Claude on first use of a species, stored, and shared by every plant of that species. It covers light, a watering interval range, humidity, temperature, soil mix, a repot interval, the fertilizer season and organic fertilizer suggestions, toxicity (informational only), common problems, and a personality seed. A user can correct it.
- **Season-aware intervals:** the hemisphere and month come from the home's location. Fertilizing pauses in the dormant season and watering stretches out in winter. *Note: today is late October in the northern hemisphere, so the starter plants enter their slow season.*
- **Watering is "check & water", adaptive [my call]:** the task offers **Watered**, **Still moist → check again in N days**, or **Skip**. The next due date learns from these answers per plant. That's the low-input way to get the schedule right without asking for soil data.
- **After-purchase care [decided: special repot after buying]:** a settling-in check after about 2 weeks, with "Is it root-bound? Roots out of the drainage holes?" and one-tap yes/no. Yes schedules a repot soon. No, in autumn or winter, schedules the first repot for early spring **[my call, standard horticultural advice]**.
- **Regular repot:** follows the species interval (typically 1 to 2 years), in spring, with a reminder of the organic soil mix and the next pot size.
- **Other tasks:** fertilizing (organic, in season only), rotating, dusting leaves, misting where relevant, and a photo reminder (monthly **[my call]**).
- **Tips:** a "tip of the day" relevant to the season and the user's own plants, plus a browsable library.

## 6. Notifications and calendar

- **Calendar [decided: one-way, mixed Google/Apple]:** each user gets a private, secret-token ICS subscription URL that works in Google and Apple Calendar. **[my call]** It contains one all-day event per day with due tasks, such as "🌿 Water Pilea & Pachira · Rotate Strelitzia", linking back to the app. Completed tasks drop out on the next refresh. The URL can be regenerated in Settings.
- **Web push [my call]:** one morning digest per user at a time they choose, for days with due tasks, plus one push for an overdue task the next morning. This makes up for Google's subscribed calendars refreshing slowly (sometimes hours). On iOS, web push requires the PWA to be installed on the home screen; onboarding shows how.

## 7. Plants as characters [decided: personality, not rewards]

- **Persona:** the AI proposes a name and a personality from the species, for example a dramatic diva Strelitzia or an easygoing Pachira. Users can edit both. The persona sets the voice of the plant's posts and of its replies in chat.
- **Avatar [my call]:** a circular crop of the latest photo with a small mood face badge. Illustrated or generated avatars are not in v1.
- **Mood:** worked out from the care state: happy (on time), thirsty or needy (due or overdue), sulking (long overdue), proud (just had a moment), sleepy (dormant season).
- **News feed events:** a birthday (the anniversary of joining, plus a "1 month with you" post), a moment logged with one tap ("new leaf", "new growth", "flower", "repotted"), a new photo, thanks to whoever cared for it, a mood change, and a season change ("going into winter mode, water me less").
- **Post wording [my call]:** each event is stored once in a neutral form. The text is generated in the reader's language and the plant's voice by a small model, then cached per language.
- **Photos:** a monthly reminder framed as the plant asking for a photo. Photos build the growth timeline.

## 8. AI gardener

- A chat per user with all of that user's plants as context: species and care profiles, the room or spot and its light, the recent task history and answers ("still moist" ×3), moments and the latest photos. A chat can be opened from a specific plant to focus on it.
- Users can attach a photo for diagnosis ("why are these leaves yellow?").
- Advice favours organic and non-chemical remedies, such as neem oil, insecticidal soap, sticky traps and fixing watering habits.
- The gardener can suggest changes, for example "water the Ficus every 10 days instead". The user accepts with one tap, which updates the schedule **[my call]**.

## 9. Discover

- Input: pick a spot (or describe a new one: window direction and distance), an effort level (easy / medium / devoted) and optional style words. The current collection is the default style reference.
- Output: about 5 suggested species, each with why it fits, its care level, and how it relates to plants they already own. Suggestions can be saved to a **wishlist**. Buying a wishlist plant turns it into the add-plant flow.

## 10. How it's built

- **Hosting [decided]:** Yann's self-hosted Coolify.
- **App [decided]:** Next.js (App Router, TypeScript) as a PWA, mobile-first. **[my call]** Later native: Capacitor wraps the deployed app, so keep the client free of web-only assumptions where cheap.
- **[my call] Supporting choices:**
  - Postgres (Coolify one-click) with Drizzle ORM.
  - Better Auth with email + password, invite-only, and long-lived sessions.
  - Tailwind + shadcn/ui.
  - next-intl with en / fr / pt-BR.
  - Serwist for the service worker and install; the `web-push` library with VAPID keys.
  - Photos in S3-compatible storage (MinIO on Coolify), resized on upload.
  - ICS generated with `ical-generator`.
  - Scheduled jobs (task generation, push digests) run from a Coolify scheduled task calling a protected internal route every 15 minutes.
- **AI [my call]:** the Anthropic API.
  - `claude-sonnet-5-5` for identification (vision), care profiles, the gardener chat and Discover.
  - `claude-haiku-5-5` for news-post wording and tips.
  - One server-side API key.
  - Prompt caching on the plant-context block.
  - **[my call] Monthly spend cap:** default $20, set in Settings. At 80% the app warns Yann. At the cap, the optional AI features pause: news-post wording falls back to plain templates, and tips, chat and Discover show "back next month". Adding a plant keeps working: identification still runs, or the user picks the species from a list.
- **[my call] No email service in v1:** Yann's account is the admin. He creates invites as one-time links and sends them himself, and he resets passwords from an admin screen. Email can come later.


### Data model sketch
User (role admin/member, locale) · Home (location, hemisphere, AI spend cap) · Group · GroupMember · Spot (home, name, light level, window direction) · Species (care profile JSON, persona seed) · Plant (group, spot, species, name, persona, acquired date, pot size, status alive/dead/given away) · CareTask (plant, type, due date, adaptive interval state) · TaskCompletion (task, user, outcome watered/still-moist/skipped, at) · Photo (plant, user, url, taken at) · Moment (plant, type, photo?, user) · FeedEvent (plant, type, payload) + FeedText cache (event, locale) · ChatThread / ChatMessage · WishlistItem · PushSubscription · CalendarToken.

## 11. Build phases [my call]

This document describes the whole app. The first implementation plan covers **Phase 1 only**, task by task. The database schema is designed for every phase from the start, so later phases never need to rework it. Each later phase gets its own plan.

1. **Foundation:** auth and invites, groups and spots, adding a plant by photo with AI identification and care profile, the care engine and adaptive watering, the home "needs attention" list with one-tap actions, the PWA install, the ICS feed, the push digest, i18n, the admin invite and reset screens, the AI spend cap, and deploying to Coolify. Seeding means the three users add the 10 starter plants through the real add-plant flow. That's the acceptance test for "adding a plant takes under 30 seconds". **[my call]** "Just bought" defaults to a purchase date of late October 2026, so the settling-in checks come up in early to mid November.
2. **Personality:** personas, moods, avatars, the news feed, birthdays and moments, and photo reminders with the timeline.
3. **AI gardener:** contextual chat, photo diagnosis and suggested schedule changes.
4. **Discover & tips:** recommendations, the wishlist and the tip library.
5. **Later:** a native app through Capacitor.

## 12. Left to the builder
The exact domain or subdomain and Cloudflare tunnel setup, the visual design system and colour palette, prompt wording, the image resize sizes, the backup strategy for Postgres and MinIO on Coolify, and test tooling details.

## 13. Verification
- Unit tests for the care engine: season adjustment, adaptive watering, the after-purchase flow, and shared-task completion clearing the task for the whole group.
- Playwright end-to-end tests on a mobile viewport: sign in as each of the three users, add a plant from a photo, tick off a task as Adriana and confirm it disappears for Yann, and switch the language.
- Lighthouse PWA audit: installable, with an offline shell.
- Subscribe to the ICS link in Apple Calendar and Google Calendar and check that events appear and update.
- Receive a push digest on an installed iOS PWA and an Android PWA.
- Deploy to Coolify. Yann, Adriana and Marcela each add their own starter plants on their phones, and each person's home screen shows only the plants in their groups.
