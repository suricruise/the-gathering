# Stage 7 — community navigation, search and notification controls

## Existing behavior and preservation

The Stage 6 workspace already provided real membership-filtered categories/channels, channel descriptions, unread/mention counts, private Broadcast, current-channel full-text search, username autocomplete, secure message links, thread panes and privacy-aware read state. Categories reset on mounting, community switching chose the first channel, search lacked community/filter controls, and notification consent was global. No communities, channels, histories, identities, grants or providers are replaced here. The persistent LiveKit boundary and navigation outside chat remain.

## Navigation and reading

- Category state and last visited channel are stored per authenticated user/community in RLS-protected preferences. Both desktop and mobile channel drawers use that state. Native summary/Tab/Enter behavior remains; Arrow Up/Down and Home/End move among visible category summaries/channel links.
- Community switching tries the saved channel only after a fresh membership and channel RLS read, then falls back to an accessible channel/community page. Deleted, disabled, moved or revoked targets cannot grant access. Category writes do not overwrite a newer visit; saves are ordered and stale UI responses are ignored.
- The existing channel description is the displayed channel topic; it stays managed through existing community/channel settings. Existing unread and mention badges remain server projections.
- Jump to first unread reads the current server receipt and handles roots and thread replies. Root context loads through existing 40-root pages; thread replies open through the existing thread panel, including when the URL already points at that message. Read marking and explicit Mark read retain Stage 6's conservative rules.

## Search

Use **Search messages** in the channel header for advanced search. The existing quick **Search channel** remains available.

- Select the current text channel or all accessible text channels in this community; filter by exact member username, inclusive UTC date bounds and whether to include thread replies.
- Keywords use PostgreSQL `websearch_to_tsquery('simple', …)`, including quoted phrases and supported web-search operators, against the existing GIN search vector. Author/date-only searches are supported. Search inputs and exact bigint cursors are validated on the server.
- Results contain only an authorized channel label, display name, timestamp, stable IDs, thread context and a bounded plain-text matching excerpt. Headline formatting uses empty selection markers and is rendered as React text, never trusted HTML. No emails, storage paths, private profiles or complete histories are returned.
- Pages show 30 results with one lookahead and an exclusive sequence cursor. Result links use the existing channel/message URL and authorized message lookup to scroll to a root or open a thread. Deleted messages are excluded; readable replies to a deleted root retain existing thread semantics.
- Every query independently enforces verified/active membership and channel view access, including selected filter IDs. Search never treats a hidden option as authorization. Changed filters cancel stale result application. Current-channel access invalidations close the search dialog; result navigation and later reads reauthorize independently.
- Search is limited to 30 requests per member/community/minute. Temporary errors, empty results, loading and retry via the form are explicit.

## Mentions

- Authorized member username lookup and keyboard selection remain in the existing composer for roots and threads. Exact member mentions are highlighted for the signed-in viewer even if notification delivery is opted out.
- Single-backtick inline-code and triple-backtick fenced-code examples do not become username/group notifications or highlights. Reserved group syntax is `@everyone` or `@role:member`, `@role:moderator`, `@role:administrator`, `@role:owner`.
- Only community owners/administrators (rank at least 30) can send group mentions. Only they receive group autocomplete suggestions; the database validates independently, including direct API writes through the existing send/edit functions.
- At most five distinct direct member mentions and one group target are accepted per message. Group sends are limited to one per author/community/five minutes and at most 200 eligible group recipients. Existing send budgets remain. A 60-per-five-minute per-recipient conversation notification budget suppresses excessive delivery without losing the persisted message.
- Recipient filtering retains live channel permission, account status, mutual blocks and global opt-outs. Retry IDs do not repeat fan-out or spend another group-send allowance. Edits validate mention permissions but do not send new mention notifications.
- New nullable server-derived `messages.mass_mention_role` marks validated group mentions for appropriate viewer highlighting. Existing messages are not reinterpreted or backfilled into group mentions. The existing fixed community roles are used; no custom-role or administrator creation path is added.

## Channel/community notifications

Open **Chat notifications** below the channel header. Each scope supports Default/inherit, All conversation activity, Mentions only or Muted.

- Default preserves existing reply/mention behavior and global consent; ordinary root messages do not silently begin notifying members.
- Explicit All activity additionally includes root conversation activity, using the existing conversation/reply notification kind and global reply preference. Mentions retain the global mentions preference. Opt-outs always win.
- A community mute overrides every channel. Otherwise an explicit channel mode overrides the community mode. Mentions-only suppresses reply/all activity delivery. Muted suppresses conversation notifications and their visible notification counts for that scope.
- Muting does not mark history read: ordinary unread indicators continue. Notification-center acknowledgement and channel read receipts remain separate, as in Stage 6.
- Settings save atomically for the authenticated user, with no actor/user ID input. Existing notifications are retained, filtered by current access/consent/mute rules, and can become visible again after unmuting if still unacknowledged. No email or push provider is introduced.

## Database and release

Migration: `supabase/migrations/202611110001_chat_navigation_search.sql`. SQL Editor alternative: `supabase/chat-navigation-search-setup.sql`.

The migration adds two own-user preference tables, a private bounded-operation budget table, the nullable validated group metadata column, authorized RPCs, and mention/notification triggers. It updates the existing message DTO and notification delivery/access functions while preserving non-channel behavior and existing grants. Own-row policies use a narrowly scoped security-definer access predicate; browser writes to preference tables and private helpers remain revoked.

1. Obtain separate approval before hosted SQL or live deployment. This stage applies SQL only to the guarded isolated local database.
2. Confirm Stage 6 (`202611100001`) is installed. Apply only pending versioned migrations, or copy the entire Stage 7 installer into SQL Editor. Do not replay old phase/table installers.
3. Recorded installer reruns skip safely. Ambiguous existing objects without a history record stop for inspection. `pg_advisory_xact_lock` output is normal. No reset, data deletion or reseed is required.
4. Deploy the reviewed app after migration approval/application. No new secrets, environment variables, public Realtime topic, storage bucket or third-party service is required.
5. Test two real accounts with different private grants, saved navigation, cross-channel and thread result links, muted and opted-out delivery, privilege rejection, read/mention synchronization and persistent live voice.

Rollback: roll back the app first and leave the additive preferences/metadata intact. A database rollback needs a reviewed follow-up restoring the prior notification/mention/DTO functions and removing only Stage 7 triggers/functions after dependency checks. Preserve all original messages, receipts, communities and preference data; do not edit published migration history or use destructive reset scripts.

## Limits and acceptance

Physical Safari/iOS/Android keyboard behavior, screen readers, hosted deployment acceptance and sustained large-community query/fan-out load remain manual gates. The existing GIN/history/revision indexes are reused; virtualized lists do not establish production throughput. User-supplied member text is exact username search rather than email lookup. Fixed role keywords are reserved in channel mention syntax. Quoted code examples are treated literally; full Markdown interpretation is not used as an authorization boundary. No production-readiness claim is made from local tests.

## Verification

Final local checks pass: lint, typecheck, **319 unit tests / 51 files**, production build, and **14/14 affected production-browser scenarios** in one final desktop/mobile run. The expanded browser run uses actual local Supabase Auth/PostgreSQL/private Broadcast and LiveKit, including genuine decoded two-way audio; it does not replace live delivery with mocks. Desktop/mobile advanced-search screenshots were inspected, and the browser tests include axe A/AA and overflow checks.

**149 isolated database/transport/installer checks pass:** navigation/search/mention/preferences 16, installer 3, messaging 24, actual private Realtime 11, threads 13, workspace 7, reliability 7, faith/events/notification privacy 26, communities 32 and interactions 10. The new checks cover private/anonymous/banned rejection, scope and author/date validation, cursor exclusivity, own-row RLS, late-save ordering, mute precedence, global opt-outs, forged group mentions, blocks/private recipients, stable-ID retries, cooldowns, a 201-member oversized audience, recipient burst limits, deleted search content and literal code examples. Fixtures are guarded loopback data and are rolled back/cleaned up.

Browser coverage verifies saved categories across reload, last-channel switching, keyboard channel focus, 67 real search matches paged across channels, private-channel omission, member/date/thread filters, message/thread result links, first-unread thread navigation, actual muted delivery suppression, direct and permitted role highlights, privileged mention rejection, access-change cleanup and existing sending/editing/reactions/files/retries/read synchronization. The same final run preserves 65-reply thread behavior, 5,000-message virtualization and a 4,205-message reconnect backlog, plus voice navigation/mute/reconnect/moderation.

Verification initially caught a historical bulk-fixture notification budget assumption, unread-aware history assumptions, stale navigation/settings UI races, missing exact dropdown labels and test-field/ID/type errors. Those were corrected without removing authorization assertions. An incomplete production build caused one browser attempt to fall back to development; it is excluded from final evidence. Incrementally added local RPCs also required a PostgREST cache refresh; the complete installer already includes `notify pgrst,'reload schema'`. The final production build was confirmed present and live before the passing run.

Source/history and client-bundle scans pass, including the new staged files; they check recognized credential patterns/configured secrets, not every possible secret format. No hosted SQL, Git push, live deploy, production test-account creation or production data modification is part of this stage.
