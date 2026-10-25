# Phase 3 follow-ups

Decisions taken while building Phase 3 (AI gardener) and the minor issues the final review left for later.

## Rulings made during the build
- Task 4: Ruling: an alert replaced by a newer one is marked dismissed with resolvedBy null, and only person-resolved alerts (resolvedBy set) count for the 14-day suppression — a replacement isn't the user saying 'not now' — cost if wrong: none
- Task 6: Ruling: suggestions are only offered in plant conversations (the general chat answers but proposes nothing) — a suggestion needs a target plant and the general thread has none — cost if wrong: one extra tap to open the plant's chat
- Task 8: Ruling: the gardener entry is an action button on Home ("🩺 Gardener") plus "Ask the gardener" on plant pages and warning cards; the tab bar stays at 4 items — keeps the bottom bar uncluttered on a phone — cost if wrong: one tap more to reach the general chat
- Task 8: Ruling: e2e login helper waits up to 15 s for the home page — the first page after a cold dev-server start can take >5 s to compile — cost if wrong: none
- Final: Ruling: "Ask the gardener" on a warning card (redirect from a client transition) has no e2e — the server function is covered by seedAlertMessage tests; the redirect is standard Next — cost if wrong: the button does nothing visible until reload

## Deferred minor issues
- user's own chat message only appears with the reply (shows "thinking…" meanwhile); paused toast clears typed text; no auto-scroll to newest
- alert card / chat accept errors silent or reach error boundary
- confirmWater not pluralized ("every 1 days")
- empty threads (and threads of dead plants) listed as pills
- one-open-alert-per-plant not enforced by a DB index (concurrent createAlert)
- checkPhoto claim not conditional; a photo arriving mid-run waits for the next cron; one exception aborts the rest of a check batch
- suggestion stays "applied" if applySuggestion throws after the claim; seedAlertMessage check-then-insert
- weekly pattern check re-calls the model while a same-category alert is open
- prompt caching ineffective (prompts below cache minimum)
- draft photo keys not bound to uploader (chat attach of another group's key)
- last_mood_at not backfilled for plants already sulking at deploy
