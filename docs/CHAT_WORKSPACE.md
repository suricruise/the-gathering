# Community chat workspace — Stage 2

The existing `/channels/<uuid>` routes now use a compact community workspace. Supabase Auth, PostgreSQL messages, private Broadcast, stored community/channel identities and LiveKit media remain the same systems.

## Interface

- The existing global navigation becomes a compact icon rail in channels; its expand/collapse control and all destinations remain available. Outside channels the ordinary layout returns. Desktop voice controls remain at the bottom while the navigation list scrolls.
- The uploaded/default community banner remains above the channel workspace in a compact format. Community name/info/settings links and Discover remain available.
- A joined-community selector opens that community's first authorized channel, or its information page if it has none. It uses existing memberships and never creates, joins, deletes or replaces communities. The existing joined-community picker limit is 200, with the current community retained as an option.
- The left sidebar uses stored category positions and channel order, native collapsible categories, #/speaker icons, private flags and active highlighting. It scrolls independently. Unread counts come from existing channel receipts. Mention badges count existing unread, recipient-authorized mention notifications; opted-out notifications do not generate invented badges. Reading a channel and reading its notifications remain distinct existing operations.
- The center header shows channel name/topic. The existing timeline scrolls within the available height while the existing composer stays at its bottom. Day separators and local timestamps use stable server markup before browser localization. Same-author messages within five minutes and the same day/scope group together; deleted roots, author changes, scope changes and unread boundaries break grouping. Rich content, safe Markdown, files, reactions, threads, search and deep links remain available.
- Message actions use a keyboard/touch-accessible native disclosure control instead of showing every action on every row. Search opens from the chat toolbar. Sending still requires a committed response; offline retry retains the original operation ID.
- The optional right pane groups authorized community identities into Moderators, Online, Offline and Status hidden, with avatar/name profile links. Moderator identity does not imply online. Profiles and presence retain existing permissions. The Hide/Show members control collapses the pane; profiles open through the existing member profile route rather than exposing a second profile store.
- At narrow widths the members pane opens in a separate native dialog; at phone widths the channel list also becomes a native dialog. Native Escape/focus handling is retained. Layout uses dynamic/visual viewport sizing, safe-area spacing and keyboard-aware navigation spacing. Focus changes are deferred across pointer gestures so Send, Retry, Save and voice controls do not move before the click finishes.

## Data and authorization

`src/lib/chat/workspace.ts` independently authenticates reads and switching. Navigation derives its community from an RLS-authorized selected channel and reads the existing authorized channels/categories, role, joined communities and `channel_unread_counts` RPC. It does not infer authorization from rendered buttons or accept client actors/roles.

`202611070001_channel_workspace.sql` adds two projections, with no new tables, records or provider changes:

- `channel_workspace_mentions(community)` aggregates only the authenticated recipient's existing unread mention notifications for currently accessible, nondeleted channel messages. Notification authorization and channel access are both checked.
- `channel_workspace_members(channel, after)` returns 30 rows plus an existence sentinel, scoped to active community members after current channel access/eligibility/block checks. It projects permitted role/avatar/status fields, including friends; it does not return private biographies, email or last-seen timestamps. Shared community presence is used when enabled; otherwise a friend may see existing friend-shared presence. Other status stays unknown, never fabricated offline.

Both functions derive the actor from Auth, have fixed search paths and authenticated-only grants. Member reads retain an existing operation budget. Navigation/member metadata refreshes every 30 seconds while visible and online, and on visibility/reconnection; no subscription is opened for every channel. Counts and member presence may take up to one polling interval to update. Member pages reconcile UUIDs, clear on denial and discard obsolete responses. Refresh restarts the member page, and group counts describe loaded members rather than an unbounded total.

The chat hook, persistence/edit/delete/reaction/history/reconnect RPCs, private topic epochs, file routes and LiveKit provider remain intact. Threads/search still use their existing modes; simultaneous thread/search side panes, persistent drafts, virtualization, expanded file formats and Enter-to-send are later work, not implied by Stage 2.

## Production update

1. Obtain the owner's release confirmation and follow normal backup/migration procedures.
2. Verify the preceding member-rail migration exists. Run the entire `supabase/channel-workspace-setup.sql` through trusted Supabase SQL Editor or the reviewed versioned migration process.
3. This installer adds only the two functions and records version `202611070001`. A recorded rerun skips; unknown objects without history stop for inspection. Do not delete tables or rerun early phase setup. No public-profile/presence defaults are reset.
4. Deploy the matching application and verify the exact Vercel commit is Ready / Production. No new environment variables, bucket, chat provider, LiveKit worker or media grants are introduced.
5. Test with designated accounts in two communities: switch community/channel, send/receive/edit/reply/react, verify private denials, check real unread/mention counts, open/close both mobile drawers and keep a genuine voice connection while navigating.

Before this additive migration, existing message operations remain available, while the new member projection reports setup unavailability and mention count errors are surfaced instead of fabricated. Roll back the application to a compatible release while retaining the additive functions; do not erase live data or alter authorization to restore appearance.

Automated local evidence and remaining limitations are recorded in `DEVELOPMENT_LOG.md`. Physical iOS/Android keyboards, Safari, network transitions and production-scale communities remain manual/load acceptance gates. Browser emulation does not certify them.

## Stage 3 composer update

The later composer request is documented in [CHAT_COMPOSER.md](CHAT_COMPOSER.md). It adds Enter/Shift+Enter, emoji, authorized mentions, staged uploads/progress and immutable retry while retaining this workspace and providers. This supersedes the Stage 2 statements that keyboard sending/emoji/mentions were future work. No additional migration or environment setting is required for Stage 3.
