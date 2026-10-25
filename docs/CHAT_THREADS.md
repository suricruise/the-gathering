# Stage 5 — community message threads

This stage uses the existing `messages.parent_id` / `reply_to_id`, stable UUIDs, history cursor, private channel Broadcast and Stage 3 composer/Stage 4 actions. It creates no second message store, chat provider, voice connection or per-thread subscription.

## Experience

- **Reply in Thread**, Reply, Start thread, View thread or the parent reply-count/activity link opens the selected original message and replies in a right-hand pane. On larger screens the channel timeline and its composer remain visible. The thread temporarily occupies the member-pane space; closing restores the member display preference.
- At compact widths (1,000px and below), the thread uses the conversation area as a dedicated view with **Back to channel**. Global navigation, channels/member drawers and persistent voice stay available.
- The channel list stays mounted. A visible-message anchor is restored when changing the pane layout; incoming thread replies use their own scroll state. Opening/closing a thread never reinitializes VoiceProvider or the channel transport.
- Both panes have separate composers and staged files. The channel draft survives thread opening/closing. The currently selected thread keeps its volatile draft/pages when closed and reopened. Selecting a *different* thread replaces the prior thread draft and aborts its uploads; there is no cross-thread draft carryover or persistent browser outbox. Changing channel/signing out clears these in-memory drafts too. An uncertain thread send locks closing/switching until safely retried with its original ID.
- The original message displays rich existing content/actions. Replies support the same authorized Markdown, attachments, mentions, reactions, edit/delete/report/pin actions and stable message links. DOM IDs are pane-scoped to avoid duplicate HTML IDs; database IDs and links are unchanged.
- Initial thread history loads only on demand, at most 40 rows. **Load older replies** has an independent cursor and preserves the reading position when prepending. Closing/switching invalidates stale responses; reopening validates current access and merges the newest page by ID/version. Old shared replies outside the newest page are shown and centered with a context-gap notice; older paging can fill that gap. Live changes use the existing channel catch-up path and exact bigint reconciliation. Background channel catch-up still includes authorized channel reply changes; a separate thread socket is unnecessary.
- Parent rows display live reply count and the latest nondeleted reply's timestamp. Deleted originals remain tombstones with existing replies available; new replies under a deleted original are disabled and rejected by the existing database send command.

Channel receipts remain channel-wide. Reading a thread does **not** automatically advance the channel watermark beyond unseen root messages; **Mark read** remains the explicit whole-channel action. Typing remains channel-scoped. Per-thread receipts, typing topics, named thread channels, watchers and persistent drafts are follow-ups rather than invented state.

## Authorization and notifications

New `channel_thread_page` verifies current channel access and that the parent is a root in that exact channel, then uses the existing 40-row history query. Anonymous callers, inaccessible private channels, cross-community parents and reply-as-parent attempts are rejected. Existing send/edit/delete/react/file commands and RLS remain authoritative. Revocation rotates the same private channel epoch; the existing session/subscription gate clears the whole workspace, including the thread and its pending UI work.

Existing direct-reply and mention notification triggers remain. Prior live thread authors (including the original author) also receive a generic `replies` notification, excluding the actor and the already-notified direct recipient. Posting in the thread establishes participation; simply opening a thread does not subscribe someone. The existing notification helper rechecks current access, active-account status, mutual blocks and notification preferences. Per-recipient stable dedupe keys prevent duplicate participant notifications; send retries do not create a second insert/event. No private reply text is copied into notifications. A member who opts out of replies/mentions or loses private access receives no corresponding notification.

Fan-out runs transactionally through the established notification helper. The new partial activity index supports thread queries and participant scans, but very large participant counts/hot-channel throughput need load measurement; this implementation does not claim unbounded production scale. There is no new unattended worker or silently dropped participant cap.

## Migration and release

Additive version: `202611090001_channel_threads.sql`. It adds one partial activity index, a validated thread-page RPC, participant notification trigger and optional `thread_latest_at` projection field. Existing tables, identities, messages, reply relationships, RLS grants and private topics are preserved. No environment variable, storage bucket or SDK changes are required.

Production SQL and publishing require explicit owner approval; local implementation/testing does not modify the hosted project.

1. Confirm backup/recovery arrangements and the Stage 4 pin migration (`202611080001`).
2. Apply only pending migration `202611090001` through the normal reviewed process, or run the entire `supabase/channel-threads-setup.sql` in Supabase SQL Editor after approval.
3. The installer is transactional, records the version, safely skips recorded reruns and refuses ambiguous existing objects. Do not reset tables, delete messages, replay early phase setup or manually mark unverified history. `pg_advisory_xact_lock` output is normal.
4. Verify read-only:

   ```sql
   select version, name from supabase_migrations.schema_migrations
   where version = '202611090001';
   select to_regprocedure('public.channel_thread_page(uuid,uuid,bigint)') is not null as thread_page_exists;
   ```

5. Deploy the matching approved application and verify the exact Vercel commit is Ready / Production. With two designated accounts, open/reply/switch/close/reopen, test mentions and notification opt-outs, and revoke private membership while a thread is open. Test real voice while navigating too.

If the RPC is missing, the thread reports the required database update instead of pretending it loaded. Roll back the application while retaining the additive index/functions/notification trigger; older clients can ignore the added metadata. Do not erase thread data or remove objects as a rollback shortcut. Follow existing recovery/retention procedures for data incidents.

## Verification and limits

The development log records the exact completed runs. Unit checks cover server input/identity/cursor guards, cross-channel projection rejection, lazy loading, stale responses, access-loss handling and retry. Isolated SQL tests cover private/cross-community denials, bounded ordered paging, stable IDs, count/activity metadata, direct/participant deduplication, independent reply/mention preferences, mutual blocks, revoked grants/membership/bans and deleted originals. The installer has fresh/rerun/ambiguous-state checks.

Real two-account browser tests cover separate drafts, desktop side-by-side and compact navigation, channel anchors, 65-reply paging, mentions, live delivery, editing/reactions/deletion, thread switching/isolation, reopen and private-access revocation. Existing messaging/workspace/voice suites protect earlier actions, retries, member/channel navigation, mobile viewport controls and actual decoded audio.

Physical Safari/iOS/Android keyboards/clipboard, screen readers, cellular transitions, hosted acceptance and large-room performance remain manual gates. The existing catch-up safety reset after extreme backlogs and unvirtualized channel cache remain inherited limits; no background persistent draft/history cache is introduced by this stage.
