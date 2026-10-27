# Faith Circles — Phase 4 interactive study room

Faith Circles live study scheduling uses the existing voice system: see [Study Hangouts](FAITH_STUDY_HANGOUTS.md) for the separate `202611220001` update and privacy/operating instructions.

Phase 5 discussion/prayer extension: [current implementation, audiences and setup](FAITH_CIRCLES_DISCUSSION_PRAYER.md). New Circle prayers default to author-only; legacy prayer audiences are preserved. Session conversations reuse existing real-time chat.

The existing session route now opens the interactive room. Communities, Auth, chat, voice, study/question IDs and saved Phase 2 responses/completion remain authoritative.

## Member workflow

- Open a published study’s released session from Faith Circles, its Circle page or study overview.
- On desktop, the left panel contains Circle/study identity, paginated session navigation with own completion markers, overview/Circle links and permitted discussion, prayer and Hangout shortcuts. The center scrolls independently for long reading; the right shared-response panel can collapse.
- On mobile/tablet, session navigation is a disclosure and discussion opens in a native modal with Escape/focus handling. Bottom spacing reserves the existing voice and mobile navigation controls.
- **Read:** passage reference and copy action. Translation selection/full passage are explicitly unavailable until a licensed Bible integration is approved/configured; no Bible text is generated or fetched as a substitute. Each session currently has one reference, so there is no invented passage carousel.
- **Understand:** original leader teaching uses the existing safe Markdown renderer (headings, paragraphs, supporting links/references; HTML/scripts and external image embeds remain disabled).
- **Reflect:** answer each question, save privately by default, edit your own saved response, or explicitly choose Circle sharing and press the share action. The right panel displays only authorized, explicitly shared answers. It refreshes/paginates separately. Questions beyond the first page can be loaded; a shared-answer shortcut can load/focus its exact question without downloading every lesson.
- **Apply / Pray:** separate owner-only personal and prayer reflections. These never appear in the shared feed, including for leaders/moderators. Clear the text and save to erase a reflection. Existing Circle prayer requests are a separate explicit submission with their existing community/moderator privacy choices.
- **Gather:** actual linked event details/RSVPs, the persisted schedule note and a permitted existing voice-room link. Opening a study does not connect a microphone, record audio or simulate a live room. Join/mute/devices/reconnect/removal still use the existing LiveKit interface and server token/enforcement checks.
- **Progress:** completion/incompletion requires the explicit button and saves server-side. Visiting saves only resume position. Both remain private to the member.

Only acknowledged saves persist. Unsaved text stays in the current form after a failed request, with a retry/error message, but is not put into local storage or an offline queue. Save before leaving the page. Saved answers and notes reload when returning halfway through a study.

## Resume, permissions and saved data

`study_bookmarks` stores one latest visited session per user/study. The session/study pair has a composite FK. Discovery/Continue prefers that member’s last **unfinished** accessible visit, then the first released incomplete session. A finished visit does not prevent continuing to the next incomplete session. Raw bookmark retrieval remains owner-only; no visit activity is broadcast to other members.

`study_reflections` stores unique user/session/kind (`application`, `prayer`) records with revisions. It has owner-only RLS and no client mutation grants. Neither a Circle leader nor platform/community moderator role unlocks private notes. Empty saved content erases the text while preserving revision protection against stale retries. Auth deletion cascades notes/bookmarks; existing ownership-transfer requirements and the Phase 2 offboarding/retention rules still apply.

Question answers remain in `study_responses`, with the existing ownership, audience, revision, hiding/removal and block checks. Sharing is an explicit save operation; changing back to private removes the answer from fresh shared-feed reads. Already read content cannot be recalled from another person’s memory/browser snapshot. Shared answers update in other sessions when refreshed; this is not a new real-time chat provider.

All room reads/writes recheck verified/live membership, exact Circle/study/session relationships, published/rights-confirmed status and release time on the server. The interactive room does not expose draft or future sessions, including through its navigation/cursors. Approved authoring/preview APIs retain their separate existing permissions. Published teaching remains immutable under the Phase 2 policy; approved leaders create a new edition rather than silently rewriting completed material.

Replies, reactions and threaded conversation remain available through the linked existing community text channel, not a parallel discussion database. The room does not pretend that a structured answer UUID is a chat message UUID. Shared-response member links and existing user-report routes remain available; dedicated study-response reporting/thread mappings are future work. Hidden/removed answers cannot be republished by editing through this UI.

## Implementation and performance

- `room-types.ts`: strict input/output contracts; no client actor/role fields.
- `room.ts`, `room-actions.ts`: existing authenticated Supabase client, `faith_room_read`/`faith_room_command`, validated receipts and narrowly scoped catalog/overview revalidation.
- `StudyRoom.tsx`, `RoomEditors.tsx`: six-section reader, local canonical saved-state updates, separate paginated navigation/questions/shared responses and explicit note/completion controls.
- Existing persistent member layout/VoiceProvider remains mounted. The general right activity panel is replaced only on a study-room route by the room’s contextual panel; all other routes retain it.
- A room loads one lesson plus bounded question/answer/navigation pages. Navigation returns titles/numbers/completion, not whole study teaching. More/reload operations fetch the requested collection only. Mutation handlers return the saved answer/note or completion receipt; they do not request entire study histories or call `router.refresh()` after every keystroke/save.
- Current activity shows timestamps from loaded **shared** answers only; no private save/progress/visit counts are exposed. No new Realtime topics, external media provider, public file URLs or notification delivery is introduced.
- Personal data stays out of local storage/PWA caches and application/audit text logs. Existing budgets apply; visit/reflection writes are capped at 90/minute and room reads at 240/minute, with existing answer/progress limits retained.

## Database installation and release

New additive version: **`202611200001_faith_study_room.sql`**. Required predecessor: discovery `202611190001`.

1. Back up and verify the existing migration history.
2. After production approval, apply only `supabase/faith-study-room-setup.sql` (or the versioned migration through the normal migration tool).
3. Recorded reruns skip; objects without a version record cause a refusal requiring inspection. Do not reset tables or record an unverified migration as applied.
4. No content seed, existing community conversion, new environment variable or provider change is required. A `pg_advisory_xact_lock` result is normal; inspect the full SQL result for errors.
5. Deploy reviewed application changes only after approval and verify with designated accounts. This task changes only the isolated local development/test database.

An application rollback can leave additive notes/bookmarks and compatible summary fields in place. Do not drop study, user, prayer or community data as a rollback. Private notes/bookmarks belong in the existing protected backup/recovery and account-deletion procedures.

## Testing and known limits

Commands: `test:faith:room`, `test:faith:room:setup`, full `npm test`, lint/typecheck/build/bundle checks and `e2e/faith-room.spec.ts`. The room browser scenario uses actual local Auth accounts/RPCs to test saved private/shared answers, edits/reloads, leader privacy isolation, paginated shared answers, exact question loading, private notes, explicit completion, resume, scheduled denials, responsive layout, modal Escape and targeted axe checks. Voice regressions enter the interactive room and save completion while confirming actual decoded audio in the other authenticated browser.

Executed locally: 421 unit tests, 17 room SQL checks, 3 installer checks, all 60 finite npm regression commands, lint/typecheck/build/bundle and 140 distinct browser scenarios passed across the full run (139 passed/1 visual timing failure) and unchanged-baseline targeted rerun (2 passed). The full run took 22.4 minutes; the visual rerun took 26.8 seconds. The already-running gateway passed four HTTP checks; its startup command was not counted as a finite test. The broader regression run and exact outcomes are recorded in `DEVELOPMENT_LOG.md`. Screenshots, when available, are local test fixtures and contain no production members/notes.

Not connected: licensed Bible translation/full-passage API, approved media-embed workflow, inline reactions/replies on structured answers, live cross-device shared-answer updates, full curriculum authoring UI and granular offboarding/export controls. The existing channel supplies real-time discussion/reactions/threads. Browser tests use Chromium emulation and synthetic microphone input over real LiveKit/WebRTC; they do not certify hardware phones, Safari, Bible licensing or hosted-scale performance. No production-readiness claim or deployment is implied.
