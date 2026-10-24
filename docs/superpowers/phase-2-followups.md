# Phase 2 follow-ups

Decisions taken while building Phase 2 (Personality) and the minor issues the final review left for later.

## Rulings made during the build
- Task 3: Ruling: backfillPhotoTasks() takes no argument (plan: today) — due date derives from photo history/join day, an unused param would be noise — cost if wrong: none
- Task 4: Ruling: createEvent(plantId, type, fields) reads "today" from the home timezone itself instead of taking a `today` param; event createdAt is set from the app clock — keeps callers simple and lets fake clocks drive day boundaries in tests — cost if wrong: none
- Task 4: Ruling: the "createPlantWithTasks → one first event" test lives in create-plant.test.ts (plan: feed-events.test.ts) — that file already has the photo/storage fixtures — cost if wrong: none
- Task 4: Ruling: payloads store the full PostPayload including a `type` discriminator — makes stored payloads self-describing for renderPostText — cost if wrong: a few redundant bytes per event
- Task 6: Ruling: callStructured gains `fallback?: boolean` (default true); feed text passes false — Haiku 5.5 has no server-side fallback per the model reference, so sending the beta+fallbacks would likely 400 — cost if wrong: Haiku refusals aren't auto-retried (template shows)
- Task 6: Ruling: Haiku max_tokens 4000 (plan: 2000) — Haiku 5.5 thinks adaptively by default and thinking shares max_tokens — cost if wrong: a few unused tokens of headroom (billed only if used)
- Task 7: Ruling: the group-move visibility test moves the plant with a direct DB update (plan: via updatePlant) — updatePlant only lets an editor move a plant into their own groups, so Y can't move it into M's group; visibility logic is what's under test — cost if wrong: none
- Task 8: Ruling: a digest with no due tasks but a birthday/first flower uses a new title "🎉 Plant news" (push.celebrationTitle) with the celebration lines as body — the care title ("N plants need you") would be wrong with nothing due — cost if wrong: one string
- Task 8: Ruling: cron tick JSON keys photoTasks/birthdays/moodPosts/seasonPosts/textsWritten added; each step wrapped so a failure logs and returns 0 instead of a 500 — cost if wrong: a broken step only shows in logs, not as a failed Coolify task
- Task 9: Ruling: e2e server builds into its own folder (NEXT_DIST_DIR=.next-e2e, next.config distDir from env) — Next 16 allows one `next dev` per distDir and Yann's own dev server (started 24 Oct 23:23) held .next; I did not stop his process — cost if wrong: an extra ignored build folder
- Task 9: Ruling: the photo-capture flow and the add-photo server action are created in Task 9 (plan listed moment-picker/actions under Task 10) — the portrait task card needs them first — cost if wrong: none
- Task 9: Ruling: relative times on posts are formatted on the server and passed in — avoids the server/client clock mismatch (React #418) seen in Phase 1 — cost if wrong: times only refresh on navigation
- Task 10: Ruling: the plant page header shows the round avatar with mood instead of the large cover photo — the timeline right below shows the photos large — cost if wrong: one layout tweak
- Task 10: Ruling: deleteMomentAction takes (plantId, momentId) (plan: momentId) — needed to revalidate the plant page — cost if wrong: none
- Task 10: Ruling: recentMoments(plantId) added to feed/queries.ts, covered by e2e/moments.spec.ts rather than its own integration test — cost if wrong: a query bug shows only end to end
- Final: Ruling: the cron step order (digests before feed text) is verified by reading, not a test — ESM module spying to assert order isn't reliable here — cost if wrong: a slow model call could delay a push by up to ~60 s

## Deferred minor issues
- thanks once-per-day check is check-then-insert (two different tasks of one plant at the same instant → two thanks)
- persona language hard-coded to en (spec: creator's language)
- Haiku isn't given the care profile; prompt forbids contradicting care but a season post could still invent advice
- first-flower push line only covers flowers logged between Madrid midnight and the push time
- addPlantPhoto posts outside the transaction and without try/catch (retry after a feed error duplicates the photo)
- /news "Load more" shows on an exactly-full last page; strict < paging can skip same-millisecond posts
- no cancel after a photo upload / open moment picker; Skip stays visible beside the chips; portrait via photo leaves no task_completion (stale Skip → blank "already done by")
