# Stage 4 — community message interactions

This stage extends the existing community chat. It retains Supabase PostgreSQL/private Broadcast, messages and reply UUIDs, the reaction table, secure media endpoints, reports/administration, and the persistent LiveKit provider. It neither recreates communities nor starts a second chat system.

## Controls

On desktop, hovering/focusing a message reveals a compact reaction/reply/thread/copy toolbar. The existing **Message actions** disclosure stays keyboard reachable and provides the full action list. On mobile, its visible 44-pixel button opens the accessible action menu; long-press is not required and native scrolling/text selection remain available. Tab navigates controls; Escape closes the action menu. Reactions retain the existing eight server-approved emoji choices.

| Action | Behavior and authority |
| --- | --- |
| Add/toggle reaction | Existing `set_message_reaction` verifies current post access. The `(message_id,user_id,emoji)` primary key and idempotent activation prevent duplicate counts. Counts and own-selected states reconcile from committed live data. |
| Reply / Start thread / View thread | Uses existing root/parent/reply relationships. An empty thread becomes persistent when a reply is sent; opening one does not create synthetic messages. The Stage 3 composer, reply cancellation and immutable retry remain in place. |
| Copy text / Copy link | Uses the actual Clipboard API. Text retains its Markdown source; links retain `/channels/:channel?message=:id`. Permission/API failures show an error. A link never grants access. |
| Edit | Author-only with current post permission, inline Save/Cancel, bounded server validation and edited indicator. Cancel makes no mutation. A rejected save retains the edit for correction. |
| Delete | Own deletion or authorized community moderator deletion uses the existing server RPC and confirmation; foreign deletion asks for a reason. Connected members receive a tombstone. Cancel makes no mutation. |
| Pin / Unpin | Community owner/administrator/moderator **and** current channel view permission. Ordinary members cannot manage pins, including their own messages. Platform roles do not silently become community roles. |
| Report | Opens the existing authenticated report workflow for the stable message ID. Existing scoped evidence, reviewer permissions, rate limits and retention apply. |

Deleted roots retain a View thread control when replies exist. Existing replies stay readable, and the composer explains that new replies under the deleted root are closed. A deleted message loses reactions/actions and cannot remain pinned. Protected moderation evidence remains governed by the existing administration system.

The channel toolbar opens **Pinned messages**, a native modal panel with safe Markdown excerpts, author, a Go to message link and authorized Unpin controls. It loads only while open, refreshes from the existing committed-change/catch-up lifecycle, and clears on access loss. It includes loading, empty, error and retry states. There is no new subscription or broadcast history. Pins are capped at 50 per channel; the indexed query is bounded by that enforced cap. Pin operations are capped at 30 per minute per authenticated actor, including idempotent repeats.

## Database and security

Versioned additive migration: `supabase/migrations/202611080001_message_interactions.sql`.

- Adds nullable `messages.pinned_at` and a partial `(channel_id,pinned_at DESC,id)` index. Existing message RLS and revoked direct writes protect the new state; no new public data table is introduced.
- Extends the existing private message projection with `pinned_at`; older clients can ignore the added field.
- Adds `set_message_pin` and `channel_pinned_messages`, with verified current access, fixed search paths, revoked anonymous/default execution and explicit authenticated grants. Actor identity comes from Auth; callers supply only a message ID and desired boolean state.
- Pin writes acquire the existing community/channel transaction locks before permission, cap and state checks. Concurrent writes serialize; repeated activation does not duplicate pins or audits. Existing message revision/Broadcast triggers deliver only committed ID invalidations.
- A trigger clears pins on any tombstone path, including existing admin/account cleanup paths. Author body edits add limited actor/action/time metadata to the existing private moderation log. Pin/unpin changes use the same log. The existing central audit trigger already records these events for authorized review; raw previous message bodies are not copied into a new edit-history store.

Existing server input bounds, posting/reaction/upload budgets, bans/suspensions, channel permissions, private media and safe Markdown remain authoritative. The client hides moderator controls as an additional presentation measure; direct unauthorized RPC and table writes still fail. No HTML rendering, public media URL, client-supplied moderator role or broad Realtime policy is introduced.

## Production setup — requires owner approval

Implementation/local verification does not authorize production SQL or deployment.

1. Confirm backup/recovery arrangements and the existing channel-workspace migration (`202611070001`).
2. After approving the production change, use the normal migration process to apply only pending version `202611080001`; alternatively run the entire reviewed `supabase/message-interactions-setup.sql` in Supabase SQL Editor.
3. The installer runs transactionally, records the version and safely skips recorded reruns. Existing interaction objects without a migration record deliberately stop for inspection. Do not delete columns/tables, replay earlier phase setup or manually mark unverified history. A `pg_advisory_xact_lock` result is normal output, not an error.
4. Confirm version and objects read-only:

   ```sql
   select version, name from supabase_migrations.schema_migrations
   where version = '202611080001';
   select to_regprocedure('public.set_message_pin(uuid,boolean)') is not null as pin_command_exists,
          to_regprocedure('public.channel_pinned_messages(uuid)') is not null as pin_panel_exists;
   ```

5. Deploy the matching approved application commit and verify Vercel Ready / Production. No new environment variable, bucket, SDK or voice worker configuration is needed.
6. With designated owner/moderator and ordinary-member accounts, verify live reactions, edit/cancel, confirmations, reports, pin/unpin and panel navigation. Confirm the ordinary member cannot see or invoke foreign edit/delete or pin controls; test a private channel without access too. Confirm real voice persists while navigating.

Without the migration, existing messaging actions continue; pin requests report the missing database update instead of inventing pin success. For rollback, revert the application while retaining the additive column/index/functions and pin data. Do not drop live objects or erase messages/pins as a rollback shortcut. Follow the existing backup/recovery and moderation retention guides for data incidents.

## Verification and remaining acceptance

`test:interactions` covers anonymous/nonmember/private denials, forged direct writes, owner/moderator changes, stable pin IDs, idempotency, duplicate reactions and own toggle, author-only edits, private audit visibility, role revocation/bans, deletion with preserved replies, the 50-pin cap and rate limits. `test:interactions:setup` checks fresh install, recorded rerun and ambiguous state in a rolled-back local transaction.

Unit tests cover controls, copying/error feedback, edit cancellation/rejection, mutation guards, confirmation, pin actions, deleted-root navigation, pin server validation and panel loading/refresh/failures. The real two-account messaging scenario exercises all action paths on desktop and mobile, including actual browser clipboard, hover/menu controls, live pin updates, unpin from the panel, pin-link navigation, reports and deleted-root replies. Existing messaging/Realtime/community and decoded-audio voice tests preserve the transport/authorization baseline. Final run results are recorded in `DEVELOPMENT_LOG.md`.

Physical Safari/iOS/Android action menus, clipboard permissions, screen readers, mobile keyboards and production-scale load remain manual acceptance gates. Reactions intentionally retain the current eight-emoji allowlist; custom emoji, reaction-user rosters, named/dedicated thread panes and virtualization are separate follow-ups. Hosted migration/deployment and physical-device results are not implied by local automated tests.
