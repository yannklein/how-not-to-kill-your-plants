# Phase 4 follow-ups

Decisions taken while building Phase 4 (Discover & tips) and the minor issues the final review left for later.

## Rulings made during the build
- Task 2: Ruling: the Discover mock returns 6 cards (plan: 5) and the prompt asks for ~6, so filtering out an owned species still leaves 5 — cost if wrong: none
- Task 4: Ruling: "I bought it" links to /plants/new?wish=<id> only (plan: ?species=&wish=); the species is read from the user's own wishlist item on the server — the URL can't inject a species or point at someone else's item — cost if wrong: none
- Task 4: Ruling: the new-spot window direction is shown as compass codes (N, NE…) rather than translated words — short and identical in all three languages — cost if wrong: a few labels
- Task 5: Ruling: repot tips carry category 'repot' so an open or recent gardener 'repot' warning blocks them too (plan only named the pattern hint's category) — same rule as overwatering — cost if wrong: one fewer repot tip while a repot warning is up
- Task 7: Ruling: the tips e2e checks the full Plant news list (/news), not the home highlights — other specs leave >5 big plant moments in the shared e2e database, which rank above tips by design — cost if wrong: home placement of tips is covered by the highlights unit test instead
- Task 7: Ruling: tip posts link to their plant when they have one; home-wide tips are plain cards with a 💡 avatar and the title "Gardener" — cost if wrong: a style tweak
- Final: Ruling: the species tip keeps "earliest plant of any status" (plan: first alive plant) — tips are keyed species:<speciesId>, so a replacement plant's species already had its tip when the first one arrived; only species owned before Phase 4 differ — cost if wrong: no "basics" tip when re-buying a species that died before Phase 4

## Deferred minor issues
- saveWishAction stores the client-sent card without validation; wish dedupe has no unique index
- no empty state when Discover returns no usable suggestions
- season tip's Haiku call runs inside the seasons step, before the digests (twice a year, ≤30 s)
- lastSeason updated before createTip; tip and recipients not in one transaction; one DB error aborts the tips step
- users with no groups don't see home-wide tips in the feed (Tips page does)
- add-plant prefill uses the AI's suggested name and the scientific name as common name; no "from your wishlist" hint
- new-spot form lacks a "no window" option
- deliverTips reads every tip_recipient row each tick
- test gaps — tips e2e seeds a tip rather than driving a season change; no dead-plant feed test; no merged paging test
