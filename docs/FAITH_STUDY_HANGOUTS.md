# Faith Circles Phase 6 — live Study Hangouts

## Existing systems preserved

Study Hangouts use existing verified Supabase Auth, Circle/community membership and approved study leadership, published study sessions/questions, event calendars/RSVPs/reminders, community text channels, LiveKit and the persistent member-layout `VoiceProvider`. Installed LiveKit React/client/Node packages and the existing microphone-only token endpoint remain in place. No new voice provider, user identity, chat system, media bucket, recording pipeline or service secret is introduced.

## Host a study

1. Open a joined Faith Circle and choose **Schedule Study Hangout**. The link is available to currently approved primary/co-leaders or approved community administrators. Operator approval and current membership are required on the server; hiding a link is not authorization.
2. Choose a Circle, a published/rights-confirmed Bible study and its session. Draft/archived studies cannot be scheduled. Approved planners may select future released sessions, but ordinary readers cannot load their reference/questions until release.
3. Enter the title, description, start/end and IANA time zone. Viewers see local times plus the original zone. Schedules can begin up to five minutes ago for an immediate meeting, extend at most one year ahead, and last at most seven days. The meeting must start at/after the session release. DST gaps are rejected; verify the final displayed schedule around ambiguous fall-back times.
4. Choose **Authorized Circle members** or **Selected Circle members and host**. Selected audiences support up to 100 current members; the actual connected-room limit is separately 2–50. Blocks, bans, channel overrides, account eligibility and approval still apply. Publishing is an explicit action that creates one dedicated voice channel and a real calendar event. Stable request IDs prevent duplicate publication on retries.
5. Eligible members can discover the event on Faith Circles Home, the Circle, the study session and the existing event/calendar views. Open it to see the schedule, passage/questions after release, RSVP and optional associated text discussion. Joining opens at the scheduled start and closes at the end; there is no early admission or requirement that the host arrive first.
6. Choose **Join with microphone** or **Join muted**, then use the existing microphone, deafen, device, autoplay and leave controls. Participants/speaking/connection indicators are actual LiveKit state, not fabricated occupancy. Only connected authorized members receive the participant list.
7. **Open Scripture study session** uses normal in-app navigation and retains the same live voice connection. Return using the session’s Study Hangout card or persistent connection panel. Full reloads, closing the application and OS background restrictions are different lifecycle events and can disconnect media.

The planner requires existing published content. This phase does not seed demo studies or add the full curriculum-authoring/approval UI; use the existing approved study-authoring backend/operator workflow. Incomplete configuration, loading, empty, offline and failed-save states do not claim a successful room connection.

## Controls and permissions

The current approved host may remove ordinary participants from **this meeting only**, including standard members of equal community rank. This is not a community/platform role promotion. Community/platform peers and superiors retain existing hierarchy safeguards. Removal requires a reason, is audited and suspends the target from that room for 15 minutes. Associated text moderation/pins continue to require the original community chat roles; study hosting alone does not grant chat moderation.

The current host and already-authorized community administrators can cancel, end or change the audience. Existing authorized community moderators may remove participants within role safeguards. Staff roles alone do not reveal a selected-audience meeting. Audience changes invalidate reservations, rotate the room epoch and disconnect everyone for fresh authorization. Existing selections must finish loading before the editor can save, preventing a partially paginated roster from silently replacing unseen selections.

**Cancel** closes a future/live meeting and preserves its event history. **End** closes a live meeting and records the actual end time. Both invalidate the dedicated room, not the Circle’s ordinary lounge. Dates/session/title are fixed after publication in this version; cancel and publish a replacement to reschedule or change the lesson. Closed rooms no longer appear in normal active channel navigation, while authorized event history remains available. Refresh status and periodic visible-page/boundary checks reflect time/access changes without downloading an entire study.

## Authorization and privacy

- `POST /api/voice/token` still accepts only a channel UUID and retains trusted Origin checks, verified `getUser`, rate limits, worker freshness, reservation/capacity locks, stable user identity and short-lived minimum room grants. No client room name, identity, host role or grant is accepted.
- Newly mapped rooms add current Circle/approved-host/study eligibility, exact session/community/event/channel relationships, audience, blocks, scheduled window and session release checks to existing channel and explicit-actor voice authorization. Generic channel URLs, RPC calls, token retries and normal room settings cannot bypass these checks.
- Private/selected meeting metadata is filtered in calendar, Circle, channel, notification and administrative event/channel projections. Administrative usage totals remain aggregate operational metrics. A host can still recognize their own minimal event entry through existing administration; this does not grant media admission.
- `channels.faith_hangout_only` and `events.faith_study_only` are persistent, server-controlled classifiers. If a host account, event, session or mapping is removed, the surviving objects fail closed rather than reverting to unrestricted ordinary rooms/calendar entries. Historical channels are retained for safe existing archive/soft-delete workflows; installation performs no content deletion or conversion.
- Existing private study reflections/answers/prayers are never copied into a meeting or notification. Only released passage references and leader-created questions are loaded for reading. No unlicensed Bible translation text is embedded. The text shortcut opens the existing real channel/thread infrastructure.
- RLS protects the new mapping; raw participant allowlists have no browser grants. Typed read/write RPCs reauthorize every request, reject actor/room/grant spoofing, validate scopes/inputs, use bounded pagination and audit sensitive actions without voice recordings or private study bodies.
- Polling does not recall information already read. Fresh reads/writes and existing voice heartbeats/enforcement revoke access; a visible page clears its contextual content after a denied refresh.

## Provider enforcement and limitations

The server commits restrictions first, then uses the existing LiveKit server helpers to delete a room or remove a participant. If the provider call fails, the UI says enforcement is pending; it does not pretend a connection ended. The existing independent worker reconciles participants every two seconds, and admissions fail closed when its last successful pass is older than 15 seconds. Cancellation/end/audience changes invalidate epochs; natural expiry, approval revocation, membership loss and bans are enforced through the same snapshot/lease checks.

Original tokens last 60 seconds; LiveKit refresh/revocation behavior depends on the deployed server version. There can be a brief reconnection/removal interval before reconciliation, and provider token lifetime alone does not terminate existing media. See [voice operations and limitations](VOICE.md). The worker is required; Vercel request handlers are not a replacement.

The application requests no egress/recording and grants no recording permission. Operators must also leave automatic recording/egress/agents disabled in the LiveKit project. Output-device selection, audio autoplay, microphone permission and mobile background behavior depend on the browser/OS. Use headphones and test actual phones, microphones, speakers and production TURN/firewall paths before wider release. Chromium emulation with deterministic microphone input is not physical-device certification.

Not introduced: a second voice/chat provider, recording/transcription, screen sharing, waiting rooms, recurrence, in-place rescheduling, live lesson switching, a Bible-text API, email/push delivery or automatic lesson-release notifications. Meeting RSVPs and opt-in reminders use existing events and their configured reminder worker.

## Data, performance and installation

Additive version **`202611220001_faith_study_hangouts.sql`** adds:

- `faith_study_hangouts`: one event, exact study session and unique dedicated channel, audience, revision and ended timestamp.
- `faith_hangout_participants`: normalized unique event/user selections, never a duplicate membership realm.
- Persistent study-only flags on existing channels/events, default false for historical data.
- Schedule/session/participant indexes, bounded authorized projections/mutations, and compatible narrower checks for newly classified voice/event objects. Existing function OIDs, prior checks, Auth and provider APIs are retained.

Questions/sessions paginate by their existing order with validated UUID cursors; discovery uses start-time/UUID cursors and bounded lookahead. Reading loads one session’s questions, not full study/message history. No new WebSocket subscriptions are created. Visible detail pages refresh metadata about every 30 seconds and at schedule boundaries; existing voice authorization/media continue through the original manager and worker. Rate limits include the existing event creation budget, a scoped write/read budget and at most 100 active scheduled meetings per Circle. Monitor retained event/channel growth and LiveKit participant minutes/egress; no voice media is stored in Supabase.

Production steps require separate approval:

1. Verify a backup and history through Faith Circles Phase 5 **`202611210001`**.
2. Run only [`supabase/faith-study-hangouts-setup.sql`](../supabase/faith-study-hangouts-setup.sql), or the matching versioned migration through the normal migration tool. **Do not rerun the original application’s `phase6-setup.sql` voice installer.** These are different phases/features.
3. Recorded reruns skip; ambiguous unrecorded objects refuse reset. A `pg_advisory_xact_lock` result is normal. Do not delete tables or mark an unverified migration applied.
4. Keep the existing Vercel Supabase/LiveKit variables and canonical `APP_URL`. Keep the always-on enforcement worker healthy and existing event-reminder/maintenance jobs scheduled. No new secret is required.
5. Deploy approved code, verify exact Ready/Production commit, and test designated accounts. Include selected/excluded members, future joins, release gates, end/cancel, separate physical-device audio and navigation while connected.

A compatible application rollback should retain additive data/flags and fail-closed classifications. Do not drop channels, events, memberships, studies or recordings as a rollback. Run schema/install/recovery fixtures serially in an isolated local environment; concurrent schema fixtures and account-deletion transactions can deadlock even when individual checks pass. No hosted database or live deployment is modified by this implementation task.

## Verification

Executed counts and remaining manual acceptance are recorded in `DEVELOPMENT_LOG.md`. Commands include `test:faith:hangouts`, `test:faith:hangouts:setup`, the full unit/finite regression suites, lint/typecheck/build/bundle and actual desktop/mobile Study Hangout and existing voice/Circle/Spaces browser scenarios. QA captures contain synthetic local test members only, not production occupancy or private requests.

Final local results: lint/typecheck/build/bundle passed; 446 unit tests passed; 64 finite regression commands passed (including 20 new authorization checks and 3 installer checks); 12 desktop/mobile browser scenarios passed in 4.8 minutes. Physical-device and hosted acceptance remain pending.
