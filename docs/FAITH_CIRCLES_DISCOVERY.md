# Faith Circles — Phase 3 homepage and discovery

**Phase 4 update:** the interactive room, answer editing, private application/prayer reflections, explicit completion and server-saved resume are now connected. See [the study-room guide](FAITH_STUDY_ROOM.md). Historical scope/test results below describe their original phase; full curriculum authoring, licensed Scripture and mapped inline answer threads remain separate work.

**Grow in the Word. Grow Together.**

The homepage now uses published study records and the current member’s actual saved progress. Existing communities, membership, messages, prayers, accounts and LiveKit infrastructure are preserved. No production content was created, migrated or seeded by this task.

## What members can do

1. Open **Faith & Life → Explore Faith Circles**, or use the existing Faith Circles navigation entry.
2. Browse featured published studies and the eight requested topics. Card descriptions, lengths, session counts and Circle names come from persisted records.
3. Join a public Circle directly from its study card or overview. For invitation/request-based Circles, open the study overview and request membership; the button displays the real pending state. Private Circles are hidden from nonmembers.
4. See **My Faith Circles**, each Circle’s existing cover, newest-created accessible published study, private progress and actual study-update timestamp. If only the older reference metadata exists, it is explicitly labeled a current study reference.
5. Open a study overview or a released session. Read passage references, original teaching, reflection questions, application and prayer prompts. Longer session/question lists load additional authorized pages on demand.
6. Mark a session complete or incomplete. This calls the Phase 2 backend and refreshes canonical server state; failed saves leave progress unchanged and show an error.
7. Return to **Continue Studying** to open the first released, incomplete session. A study becomes active after the member saves an answer or completes a session; viewing a page alone is not tracked as enrollment. Completed studies leave this active list and remain available through My Circles/Explore. If all released sessions are complete but later sessions are scheduled, the UI says so and links to the study overview.
8. Use existing linked group discussion, Hangout and scoped prayer-request routes. Opening a room never pretends to connect the microphone.

A study’s full session count is its published length; completion counts include only that member’s released-session completions. No other member’s progress is returned. “Study updated” is the persisted study timestamp, **not** invented chat activity. Upcoming Hangouts retain the existing six-event projection from the first twelve joined Circles; My Circles itself can load further pages.

## Published study discovery and leader controls

Existing published studies are **not automatically exposed to nonmembers**. The additive discovery metadata defaults off:

- `discovery_enabled`: explicit opt-in for sharing the title/overview with nonmembers who can discover the Circle.
- `discovery_featured`: editorial featured status for otherwise permitted viewers.
- `discovery_topic`: one of the eight persisted topic categories, or unset.

An approved current study leader/editor can open a **published** study and expand **Study discovery settings**. Select the topic, optionally opt into nonmember discovery, choose featured status, and save. Membership/privacy restrictions still apply; enabling discovery never opens a private Circle or its lesson content. A study can be featured only for current members when nonmember discovery remains off.

The server/database reauthorize every change and record a minimized audit event. Ordinary members cannot curate, self-approve or publish a draft. These settings change discovery metadata, not the immutable teaching in a published edition. They share existing per-user write limits.

Creating/editing/publishing complete study curricula still uses the approved Phase 2 backend; a full authoring dashboard is a future stage. An empty featured section is expected until actual published studies are curated. This release does not insert sample studies or present the older current-reference field as a published curriculum.

## Required database update — production approval still needed

New version: `202611190001_faith_discovery.sql`.

1. Verify that Phase 2 version `202611180001` is installed and recorded. Do not rerun old installers over existing tables.
2. Back up and inspect migration history before any approved hosted change.
3. Apply **only** `supabase/faith-discovery-setup.sql`, or its versioned migration through the established migration tool.
4. Recorded reruns skip. Objects without a migration record cause an explicit refusal; investigate schema/history rather than deleting objects or blindly recording a version.
5. `pg_advisory_xact_lock` output is normal transaction-lock output. A SQL error still requires investigation; do not infer success from that row alone.
6. Deploy the reviewed code only after release approval, then verify with designated accounts. This task installed and tested only in the isolated local stack.

No new environment variables, Bible API keys, media service, authentication flow or storage bucket are required. Existing Supabase, canonical application origin and LiveKit configuration remain unchanged. Roll back application code compatibly and retain new metadata; do not delete communities or study/progress records to roll back presentation.

## Implementation and security

- Homepage/read models: `discovery.ts`, strict schemas in `discovery-types.ts`, authenticated `faith_study_directory` and `faith_study_summary` RPCs.
- Cards/lists/control components reuse existing theme tokens, membership/progress services, community covers, prayer/event routes and safe Markdown.
- Routes: `/faith-circles`, `/faith-circles/[circle]/studies/[study]`, and the corresponding `/sessions/[session]` route. Circle pages now link to their actual published studies.
- Public summaries contain opted-in listing metadata only. They never include teaching, questions, prayer contents, personal responses, private progress, unreleased session IDs, rosters or email addresses.
- Existing member-only table RLS is unchanged. Exact study/Circle/session relationships and release permissions are checked server-side; a link or hidden button grants nothing.
- Private reflections and answer editing remain protected by Phase 2 rules; no personal answer text is copied into cards, audits or notifications. The answer editor is not implemented in this phase.
- No Bible translation text/API is bundled. Four original book-and-landscape SVG artworks supply the Scripture-themed imagery without copying reference assets.
- Browse queries are bounded and cursor-paginated, use existing indexed study/session/progress relations and a new discovery index. No full chat history is fetched and no new Realtime subscription or voice provider is mounted.
- Authenticated study/topic links disable eager prefetch to avoid unnecessary private requests and budget consumption. Private data is not placed in local storage, offline queues or PWA caches. Public SVGs are ordinary static assets.
- The persistent member-layout voice provider is unchanged. Nested study routes resolve their secondary navigation through current joined community membership.

## Verification and limits

The final result/test evidence is recorded in the development log. Reproduce locally with:

```sh
npm run test:faith:discovery
npm run test:faith:discovery:setup
npm test
npm run lint
npm run typecheck
npm run build
npm run test:bundle
# Use the established isolated local environment for browser fixtures.
npx playwright test e2e/faith-discovery.spec.ts e2e/faith-circles.spec.ts e2e/voice.spec.ts
```

The discovery browser test uses real local authenticated accounts, persisted published studies, actual leader curation, topic filtering, join/request actions, private progress saving, correct next-session URLs, unauthorized/future/private denials, safe Markdown, image loading, overflow and targeted homepage axe checks. It captures 1440/1024/390/320-width visual evidence. See [screenshots](qa/faith-discovery/README.md). Fixtures are isolated test data, not production members/content.

Unfinished: full curriculum authoring and reflection-answer UI, licensed Bible integration, study-specific notifications/reporting, cross-device live progress updates, and finer offboarding/export controls from the Phase 2 guide. Changes on another device become visible on refresh. No physical-device/Safari certification, hardware microphone acceptance or hosted-scale performance benchmark is claimed. Chromium voice checks use real WebRTC/LiveKit with synthetic microphone input between separate authenticated browser sessions.


### Executed results (October 26, 2026, client date)

- Lint, typecheck, optimized production build/`next start` and client-bundle secret check passed.
- **409 unit tests in 70 files**, **16 discovery SQL checks** and three installer checks passed.
- Existing **32 backend, 20 foundation, 32 community, 26 Spaces, 24 messaging** SQL checks and **11 actual Realtime/API checks** passed.
- Final **6/6 Playwright scenarios passed in 3.1 minutes**: discovery, existing Circle/chat and actual LiveKit audio scenarios on desktop/mobile.
- Homepage image loading, no horizontal overflow at 1440/1024/390/320, screenshot inspection and zero targeted homepage axe WCAG A/AA violations passed. This is not full accessibility certification or a pixel-regression comparison.

Early selector/label/image-link issues were corrected and the affected suite rerun. All migration execution was local; fresh hosted installation, physical Safari/keyboard/audio devices and hosted-load behavior were not tested.
