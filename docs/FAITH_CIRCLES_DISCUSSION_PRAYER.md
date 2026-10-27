# Faith Circles Phase 5 — discussion and prayer

## Integration and operation

This stage extends existing communities, channel messages/threads, prayer requests, comments, encouragements and notification delivery. It does not install a competing chat provider, change Auth, convert communities, seed content or replace LiveKit. Existing messages, memberships, prayers and their visibility choices remain in place.

Open a joined Circle, then **Circle conversations** or **Prayer & encouragement**. Study rooms include **Open session conversation**, which opens a real existing channel message. Its ordinary Reply in Thread, reactions, attachments, reports, edits, moderation and private authorized Broadcast continue to work. Discussion participants use existing channel notification/mute settings; pins remain restricted by existing server permissions.

A community administrator can explicitly select **Manage Circle discussion channels → Set up Circle discussion channels**. This idempotently links or creates General Conversation, Questions About Scripture, Study Reflections and Prayer & Praise through existing channel management. It does not run automatically during installation, replace channels, move messages or widen private channel permissions. Administrators can instead link permitted existing text channels for each purpose. Archived/deleted/conflicting names require the existing channel-management workflow; setup does not silently resurrect them. Approved study leadership alone does not grant community channel administration or message moderation.

The session action persists one root message per released session, serialized with the existing community/admin lock, and invokes `send_channel_message`. PostgreSQL persists the message before the existing committed Broadcast. Retries and concurrent requests return the same stable message link. The body contains only published study/session titles (at-signs normalized to prevent generated mention spam), the passage reference and a clickable protected study route; personal answers/reflections are never copied. The safe Markdown renderer accepts only exact UUID-based internal study-session routes for SPA links, with prefetch disabled; other relative routes remain rejected and external links retain their existing protections. Normal channel permissions continue to govern that shared message and its history. Removing the original root does not silently create another root. Existing threads/replies remain in existing message relationships.

## Prayer audiences and privacy

New Circle requests start **Private — only me**. The member must choose another audience explicitly:

| Audience | Readers and responders |
| --- | --- |
| Private | Author only, with current Circle access. No leader/moderator override. |
| Me and approved Circle leaders | Author and current, approved primary/co-leaders or approved community administrators. Generic community/platform staff roles alone do not grant access. |
| Circle members | Currently authorized, unblocked Circle members; existing community moderators can moderate this shared content. |

All audiences require verified, active membership, a live enabled Circle/approved leader and current account eligibility. Mutual blocks, bans, suspension, community archive and leadership revocation apply on fresh reads and mutations. These checks are server-side and in RLS, including direct prayer/comment reads. No public prayer audience is offered.

The request has a title, description, optional latest update and optional answered-prayer testimony. Updates/testimony inherit its audience. The author can edit, change the audience, mark answered/reopen or delete. Revision checks reject stale prayer edits. Deletion erases title/body/update/testimony and removes comments/encouragements, keeping only minimized moderation records. Existing account-deletion cascades include the new preferences and related prayer records.

Comments inherit the parent request’s current audience. Comment authors can edit/delete their own comments. Eligible community moderators may remove inappropriate comments on Circle-visible requests, with a reason; legacy endpoints cannot bypass these boundaries. I Prayed is an idempotent encouragement toggle using the existing unique request/user relationship. The UI shows no prayer leaderboard, spiritual ranking or public encouragement counts.

Audience changes are explicit and explained in the editor: existing comments and updates change audience too. Previously read text cannot be recalled from another person’s browser or memory. Already rendered prayer pages are not a new live revocation channel; subsequent requests and all mutations reauthorize. Prayer detail/comments use explicit refresh and bounded pagination, rather than pretending to be a second live chat. General Faith & Life and legacy backend prayer lists exclude new Circle-scope rows. Existing `/faith/:id` notification links redirect authorized readers to the Circle prayer page. Search/activity do not index private prayer text; no prayer body is automatically posted to chat.

Private personal study reflections from Phase 4 remain separate and owner-only. Nothing in this stage reshares them. Normal trusted database/backup operators remain subject to the existing infrastructure access policy; the UI does not promise end-to-end encryption.

## Moderation and safety

Members can report Circle-visible prayers or specific comments. The protected queue is limited to current community moderators and content they can still access. It stores reason, reporter/subject/target IDs and review metadata, not copied prayer/comment bodies. A persistent target UUID survives comment deletion while its optional foreign-key reference clears, avoiding report collisions and preserving review attribution. Moderators cannot review reports against themselves or reports they submitted. Hide/removal and report-review actions use existing private moderation audit records with actor/reason/time. Reports cannot expose another Circle or a newly private request.

Reports expire after 90 days and the existing service-only `moderation_cleanup` job removes them. Fresh report reads exclude expired records even if maintenance is late. The existing operational maintenance schedule/health checks must remain configured. No broader evidence access is granted.

For leader-audience requests and comments, the UI offers the existing **Report member to platform moderators** route, including a direct link beside another member’s supportive comment. It does not automatically copy sensitive prayer text into a shared moderation queue. Author-only notes have no content-sharing report shortcut. A dedicated consent-based sensitive-prayer escalation workflow is not implemented. Members may contact platform support with information they explicitly choose to provide.

Circle leaders are explicitly described as not automatically professional counselors; the care notice also points people in immediate danger toward local emergency services. Existing member reporting and community/platform moderation remain available. New study leaders are not promoted into platform roles.

## Notifications

- Prayer comment creation reuses the existing reply trigger and metadata-only in-app notifications. Previews contain neither prayer title/body nor comment/update/testimony text.
- A member can mute prayer replies for the whole Circle; global reply opt-outs and mutual blocks also apply. Eligibility is checked both before emission and when notifications are read, so previously stored notifications disappear when access/consent is lost. Author-only prayers generate no prayer notifications.
- Session replies use existing thread-participant notifications and channel/community mute/mentions settings. Circle announcements use existing permitted channel messages/pins and channel notification preferences. There is no new automatic blast to every member.
- Study Gatherings use existing community events, RSVP and opt-in event reminders. Both global/event reminder permissions still apply. The existing reminders worker must be scheduled. Arbitrary lesson-release reminders, a new announcement-mailer and email/push delivery are not introduced.

## Database and service changes

Version **`202611210001_faith_conversation_prayer.sql`**, after study room `202611200001`:

- Existing `prayer_requests`: additive Circle-scope flag, revision, update and testimony; expanded constraint only for explicitly scoped new requests. Existing community/moderator rows are not reclassified.
- Existing `prayer_comments`/`prayer_encouragements`: reused, with scoped write guards and additional current-author/block-safe RLS.
- `faith_discussion_channels`: Circle/purpose mapping to existing channels, with authorized read projections.
- `faith_session_discussions`: session/root-message mapping with current study/channel access.
- `faith_prayer_preferences`: owner-only per-Circle reply preference.
- `private.faith_prayer_reports`: protected bounded report/review/retention metadata; no browser table access.
- Typed server services/actions validate fields, derive verified Auth, parse bounded DTOs and map failures without private diagnostics. New RPCs are `faith_conversation_read` and `faith_conversation_command`.

Successful creation keeps a canonical Open saved prayer link even if a new request falls outside the first list page. Single-request loads fetch one request plus bounded comments; lists/reports/comments use UUID cursor pagination (1–40 rows plus lookahead). Saves refresh only the current prayer collections, not the whole study or application shell. Read/write, prayer/comment creation and reporting budgets apply. No new Realtime topics, storage buckets, external media fetchers or environment variables are added. New pages remain authenticated/noindex and outside PWA public caches.

## Installation, rollback and acceptance

Only isolated local development/test schema/data was modified for implementation. For a separately approved production release:

1. Back up and verify migration history through `202611200001`.
2. Apply **only** `supabase/faith-conversation-prayer-setup.sql`, or the versioned migration through the established tooling.
3. Recorded reruns skip. Unrecorded objects refuse destructive repair; compare schema/history rather than resetting or marking an unverified version applied. A `pg_advisory_xact_lock` result is normal.
4. Deploy the reviewed code and verify author/leader/member/moderator designated accounts, channel mapping, muting, prayer audience changes, comment removal and existing voice/chat.
5. Keep maintenance and existing event-reminder delivery scheduled. No new service secrets are required.

An application rollback can retain additive tables/columns and private data safely. Do not drop prayer/chat/community records or replay old installers as rollback. Preserve backup protections and account-deletion procedures. Approval is required before hosted SQL or pushing/deploying to the live site.

Executed results are recorded in `DEVELOPMENT_LOG.md`. Reproduce with `test:faith:conversation`, `test:faith:conversation:setup`, full unit tests, existing community/Spaces/chat/Realtime/admin/voice/Circle regressions, lint/typecheck/build/bundle and the desktop/mobile prayer browser scenario. Browser checks use actual local Supabase identities and real channel Broadcast; physical-device/Safari and hosted-scale acceptance remain separate requirements.

## Executed verification — October 27, 2026

- Lint, typecheck, optimized production build/start and client-secret bundle scan passed.
- **436 unit tests / 74 files** passed.
- **62/62 finite npm regression commands** passed on the final code, including **25 new Circle conversation/prayer SQL checks** and **3 installer checks**. The gateway startup is a persistent service, not a finite test.
- **24 distinct browser scenarios passed across runs**, including affected desktop/mobile chat, permissions, media, threads, discovery, prayer, study room, events/notifications, offline recovery, 5,000-message pagination and actual LiveKit audio. The initial 22-case affected run passed 19 and failed 3; obsolete route assertions and the offline test’s navigation readiness were corrected. A later targeted run passed all four Circle/prayer cases, and the final voice rerun passed 2/2 in 1.3 minutes. An intermediate network-idle test wait timed out and was removed; no voice runtime code or reconnect assertion was weakened. Exact sequence/counts are in the development log.
- [Desktop/mobile captures](qa/faith-prayer/README.md), actual returned-HTML privacy checks, targeted axe WCAG A/AA and overflow assertions were executed.

Only isolated local services and generated fixtures were used. These checks do not certify hosted migration installation, physical-device/Safari audio, push/email delivery or production readiness.
