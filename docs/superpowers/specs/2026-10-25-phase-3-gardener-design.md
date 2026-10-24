# How Not To Kill Your Plants — Phase 3 "AI gardener" Design

Notation: **[decided]** = said by Yann. **[my call]** = Claude's default, open to override. Unmarked = follows from the parent design or from Phases 1–2.

Parent design: `docs/superpowers/specs/2026-10-24-plant-care-app-design.md` §8. Phases 1 and 2 are built and deployed. Their decisions are in `docs/superpowers/phase-1-followups.md` and `docs/superpowers/phase-2-followups.md`.

---

## 1. Intent

The plants Yann bought at first got sick. Leaves were falling, and only by trial and error did he find out they lacked light and needed another spot. The gardener is the expert who would have said so early. It does two things:

1. **Answers questions.** Ask "why is it dropping leaves?", with a photo if you like, and get a straight answer. The answer uses what the app already knows about that plant and that spot.
2. **Speaks up on its own [decided].** It notices trouble from new photos and from the care history, and says what to do before the plant is dying.

Success: the next time a plant starts to struggle, the app flags it and names the fix (for example "move it to the living-room window"), and the plant recovers.

## 2. Goals, non-goals, anti-goals

**Goals**
1. A chat with one calm expert gardener, with full context on the user's plants.
2. Photo diagnosis in the chat.
3. Proactive health warnings, shown as cards in "Needs attention".
4. One-tap acceptance of the gardener's suggested changes: the watering interval and moving the plant to another spot.

**Non-goals**
- Talking to the plants themselves. **[decided]** The chat is one calm expert, not the plants' personalities. Plant voices stay in the news feed.
- Push notifications for the gardener. **[decided]** Warnings show only in "Needs attention", and the morning push stays about care.
- Shared group chats or seeing other people's conversations.
- Diagnosing pests from microscopic detail, or soil lab analysis.

**Anti-goals**
- **Alarmism and noise.** A wall of "possible issues" or repeated cards about the same thing.
- **Chemical-first advice.** Organic and non-chemical remedies always come first (parent design §8).
- **Confident nonsense.** When unsure, the gardener says so and asks for a photo or a detail rather than guessing.
- **Data entry.** Asking a question or acting on a card takes one or two taps. The user never has to describe their plant's basics.

## 3. The chat

- **Who answers:** one calm, friendly, expert gardener **[decided]**. The gardener answers in the user's language (en / fr / pt-BR).
- **Privacy:** each person has their own conversations. **[my call]** Others in the group can't read them.
- **Where to start a chat:**
  - a "🩺 Gardener" entry in the app (tab bar or home action buttons);
  - **"Ask the gardener"** on a plant's page, which opens a conversation focused on that plant;
  - **"Ask the gardener"** on a warning card, which opens that plant's conversation with the warning already as context.
- **What the gardener knows, without being told:** every plant in the user's groups, each with:
  - name and species;
  - the care profile (light, watering range, humidity, soil);
  - spot, light level and window direction;
  - the current mood;
  - the recent care history, with outcomes such as "still moist ×3", skips and overdue days;
  - recent moments;
  - the latest photos, for the plant in focus;
  - the home's location and season (Barcelona, indoors).
- **Photos:** the user can attach a photo, which goes through the same downscale + upload path as everywhere else.
- **Advice style:** short and practical, organic / non-chemical first. The gardener asks a clarifying question when needed.
- **History:** conversations are kept so the user can scroll back.
  - **[my call]** One conversation per plant per user, plus one general conversation per user.
  - **[my call]** Only the last ~20 messages go to the model, together with the current plant context.

### Suggested changes, accepted in one tap
When the gardener recommends a concrete change, the reply carries an action button:
- **Watering interval:** "Water every 10 days" sets the plant's watering override.
- **Spot:** "Move to Living room window" sets the plant's spot. The spot must already exist; the gardener only proposes existing spots. **[my call]**

Accepting applies the change and posts a short confirmation into the conversation. Nothing changes without the tap.

## 4. Speaking up: health warnings

### When the gardener looks
1. **Every new plant photo [decided]:** the monthly portrait, a photo from the plant page, or a photo attached in chat. The gardener compares it with the plant's earlier photos and its care history.
   - **[my call]** Photos taken while *adding* a plant are not checked; identification already looked at them.
2. **A weekly pattern check [my call].** Simple rules flag plants worth a look, and only flagged plants are sent to the model, to keep costs down. The rules:
   - "still moist" answered 3 or more times in a row;
   - the same task skipped 3 or more times in a row;
   - a care task more than 7 days overdue;
   - sulking for more than 7 days.

### What a warning looks like
- A **card in "Needs attention" [decided]**, for example: "🩺 Your Ficus is dropping leaves. Its spot gets too little light. Try the Living room window."
- One-tap buttons:
  - **Done:** the user acted on the advice.
  - **Not now:** dismissed. The same issue won't be raised again for 14 days. **[my call]**
  - **Ask the gardener:** opens the chat with the warning as context.
- If the advice includes a concrete change (watering interval or spot), the card also offers it as a one-tap action, the same as in chat.
- **[my call]** At most one open warning per plant at a time. A new finding replaces an older open one.
- **[my call]** Warnings are shared like tasks: everyone in the plant's group sees the card, and the first person to tap Done or Not now clears it for all.
- **[my call]** No warning when the check finds nothing. "Looks healthy" is not shown, to avoid noise.

## 5. Cost

- **Model:** chat, photo checks and pattern checks use `claude-sonnet-5-5` (parent design §10), with the existing budgeted wrapper.
- **Budget:** chat, photo checks and pattern checks are *optional* features. At the $20 monthly cap they pause:
  - the chat shows "The gardener is back next month";
  - checks are skipped.

  Care reminders keep working.
- **Expected cost [my call]:** about 1–2 cents per photo check, a few cents per chat exchange, and the weekly check only for flagged plants. That should be well under the cap for three people.
- **Prompt caching** on the stable gardener instructions (parent design §10).

## 6. How it's built

The stack and conventions are the same as Phases 1–2. The `chat_thread` and `chat_message` tables already exist. Warnings need a new table, for example `gardener_alert` with these columns:
- plant
- source (photo / pattern)
- text per locale
- optional suggested change
- status (open / done / dismissed)
- who resolved it, and when
- a dedupe key for the 14-day "Not now" rule

All new UI strings in en / fr / pt-BR.

## 7. Left to the builder
- Prompt wording.
- The exact format the model uses to return a suggested change.
- How much history and how many photos go into context.
- Chat UI details: streaming or not, how attachments show.
- Where the gardener entry sits in the tab bar.
- How the dedupe key is built.

## 8. Verification
- **Unit:** the pattern rules (the "still moist ×3" streak, skip streaks, overdue, sulking duration) and the 14-day "Not now" suppression.
- **Integration:**
  - Access: a user can only chat about plants in their own groups.
  - Accepting a suggestion: the change is applied, and changing the spot validates that it exists.
  - Warnings: one open warning per plant, and resolving one clears it for the group.
  - Budget: optional features pause at the cap.
  - Mock mode: deterministic gardener replies and checks.
- **E2E (mobile, `AI_MODE=mock`):**
  - Ask a question from a plant page and see a reply.
  - Accept a suggested watering change and see the plant page reflect it.
  - Add a photo whose (mock) check finds a problem, then see the warning card and tap Done.

## 9. Settled after the builder check [my calls]

- **What a one-tap change does.**
  - **Spot:** "Move to …" only changes the plant's spot. The care schedule doesn't depend on the spot, because light needs live in the care profile.
  - **Watering:** "Water every N days" sets the plant's watering override, replacing any value set by hand. Only the user's tap applies it. As in Phase 1 (ruling R16), the new interval applies from the next watering.
  - **Spot list:** spots belong to the home and are shared by every group (Phase 1 design §2). The gardener sees and proposes any of the home's spots.
- **Issue categories.** Every warning carries one category, picked by the model from a fixed list:
  - `light`
  - `overwatering`
  - `underwatering`
  - `pests`
  - `nutrients`
  - `temperature`
  - `humidity`
  - `repot`
  - `other`

  The dedupe key is plant + category. Both **Done** and **Not now** suppress the same plant + category for 14 days. The difference is only what gets recorded (acted on vs. dismissed). Phase 4 tips reuse these categories (see the Phase 4 design).
- **Suggestion buttons in chat** are one-shot. The "applied" state and its time are stored on the message itself. If the change is no longer possible (spot deleted) or already in place, the button says so and nothing changes.
- **"Ask the gardener" on a warning** opens *that user's* conversation for the plant. The first time a user opens it from that card, the warning is added to the conversation as a gardener message, so the context is visible. Plants are never deleted (only marked dead or given away), so their conversations stay.
- **Photo checks run in the background, never inside the upload.** They start right after the photo is saved. The cron tick picks up any photo that hasn't been checked yet. The check compares with all earlier plant photos, including those taken when the plant was added; only those add-time photos are themselves never checked. A failed or skipped check never affects the photo.
- **Budget.** Chat, photo checks and pattern checks are optional features.
  - At the cap, uploads still succeed and the checks are skipped silently.
  - The chat shows "The gardener is back next month" as soon as it's opened.
- **Languages.** Warning text is written in all three languages in one call when the warning is created. Chat replies are in the asking user's language.
- **Pattern rules** look at the plant's history, whoever answered:
  - **still moist, 3 or more in a row:** the last answers on the plant's water task;
  - **skipped, 3 or more in a row:** the last answers on any one task type;
  - **overdue, more than 7 days:** measured against the task's current due date. A skip moves the due date, so it resets this measure;
  - **sulking, more than 7 days:** based on the stored mood baseline. The plant has been sulking since its last mood change, and that change is more than 7 days ago.
- **Placement.** Warning cards sit at the top of "Needs attention", above care tasks, because health comes first. They never count toward the morning push.
