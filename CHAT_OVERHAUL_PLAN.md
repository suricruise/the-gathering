# The Gathering — chat audit and staged overhaul plan

Audit date: October 24, 2026 (America/New_York). Source baseline: `c3eb949`.

**Task 1 is audit only.** This document proposes future work; it does not authorize implementation, migrations, production changes or deployment. Preserve existing communities, users, channels, messages, roles, memberships, attachments, stable URLs and providers. No application code or data was changed by this audit.

## 1. Existing architecture

### Framework and dependencies

The app is a Next.js App Router application with TypeScript, React, server-rendered authenticated routes, client components, Server Actions and Route Handlers. It is not a separate Vite production app: Vite tooling supports Vitest. Node 24 is required. `src/compat/navigation.tsx` adapts existing screen components to Next navigation; preserve this routing integration when extracting components.

Versions resolved in `package-lock.json`:

| Area | Existing dependencies |
| --- | --- |
| Application | Next.js 16.4.2, React/React DOM 19.3.1; TypeScript |
| Auth/database/live messaging | `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0 |
| Actual voice media | `livekit-client` 2.23.0, `@livekit/components-react` 2.9.24, `livekit-server-sdk` 2.19.2 |
| Content safety | Zod 4.6.7; `react-markdown` 10.1.0 + GFM; `sharp`; `ipaddr.js` |
| Other media | `mp4box` supports the separate social clip pipeline, not channel video uploads |
| Interface | Custom global CSS, Lucide icons, DM Sans/Manrope fonts; React state/hooks |
| Verification | Vitest/Testing Library, Playwright/Chromium, axe, PostgreSQL integration scripts |

There is no installed message virtualization or rich-text composer package. Neither is required to begin improving the interface. Avoid adding a second router, auth client, chat SDK or UI framework for this project.

### Request and provider structure

`app/(members)/layout.tsx` authenticates with `requireUser`, loads the member profile and wraps the existing application in:

```text
MemberProvider
└── VoiceProvider (persistent LiveKit connection)
    └── PeopleProvider (friends, private personal updates, activity pulses)
        └── AppShell (navigation, topbar, mobile controls, right member rail)
            └── app/(members)/channels/[id]/page.tsx
                ├── CommunityBanner + community link + channel heading
                ├── ChannelNavigation
                └── ChatWorkspace OR VoiceRoomPanel
```

The channel route uses the authenticated Supabase SSR client and RLS to resolve the channel, community and accessible channel list. Text channels preload `chat_page`; voice channels load room configuration and community role. Legacy names such as `/channels/general` resolve through The Gathering's real channel IDs when possible. Community/channel identity is persistent; routes must continue using existing UUIDs.

The current page is a vertically spaced general-purpose page with a large community banner and heading above a nested channel list/workspace. This is functional, but it is not yet a viewport-filling conversation layout.

### Interface inventory

| Source | Responsibility and current condition |
| --- | --- |
| `src/components/AppShell.tsx` | Existing collapsible navigation, app topbar, mobile navigation and member rail. Workspace switcher currently links to Discover; it is not an active-community switcher. |
| `src/components/communities/CommunityBanner.tsx` | Shared uploaded/default community banner on community, text and voice pages. Preserve the recent banner feature. |
| `src/components/communities/ChannelNavigation.tsx` | Accessible channel links with active state and a native mobile dialog. Receives only ID/name/kind: no categories, unread badges, private-channel icons or voice occupancy. |
| `src/components/chat/ChatWorkspace.tsx` | Timeline, composer, staged attachments, retry ID, history/search cursors, thread navigation, unread logic, scrolling and errors in one large client component. |
| `src/components/chat/useChannelChat.ts` | Private Realtime lifecycle, catch-up, revisions, access loss, typing and session refresh. It is the existing transport integration to retain. |
| `src/components/chat/MessageItem.tsx` | Author/avatar, UTC time, Markdown, media, previews, reactions, edit/delete, copy link, reports and aggregate read count. Actions are permanently visible. |
| `src/components/chat/SafeMarkdown.tsx` | GFM rendering with HTML disabled, safe link transformation and no arbitrary external images/embeds. |
| `src/components/people/PeopleRail.tsx` | Friends followed by Members, avatar/name links and online/offline/hidden dots; bounded membership-scoped pages, not a list of voice participants. |
| `src/components/voice/VoiceProvider.tsx`, `VoiceControls.tsx` | Real voice session, persistent connection bar, microphone/deafen/devices, participants, speaking/quality, reconnect and moderator controls. |
| `src/styles.css` | Existing responsive dark navy/purple/cyan styling; channel and chat styles share a large global stylesheet. |

Direct messages are a separate working implementation in `src/components/people/People.tsx`, `PeopleProvider`, `usePrivateUpdates`, `src/lib/people` and `app/api/people`. They are not channel messages and should not be migrated into the community message model as part of a visual overhaul.

### Database and relationships

Supabase PostgreSQL is the source of truth, using versioned migrations in `supabase/migrations`. There are no chat collections to replace.

| Existing tables/state | Purpose and relationships |
| --- | --- |
| `auth.users`, `profiles`, private account-security state | Authentication identity and verified/onboarded/active eligibility. Names/avatars use existing permitted projections. |
| `communities` | Public/discoverable/private community, description/cover, archive state and display ordering. Uploaded banner metadata uses `community_headers`. |
| `community_members`, `community_roles` | Membership scoped by community/user; fixed role definitions and active/banned status. One owner per community. |
| `channel_categories` | Community-scoped category names and positions. This data already exists. |
| `channels` | Belongs to one community and optionally one category. Text/voice kind, description, position, private/disabled state and `realtime_epoch`. Names are unique within a community. |
| `channel_permission_overrides` | Scoped role OR individual-member view/post/connect permissions. Composite references prevent cross-community assignments. |
| `invitations`, `community_audit_log` | Secure community invitations and audited membership/role changes. |
| `messages` | Stable UUID, channel and author, body, timestamps, immutable `created_seq`, update `version`, `parent_id`, `reply_to_id`, tombstone and full-text document. Composite foreign keys keep thread references in the channel. |
| `message_reactions` | Unique own-user/emoji reactions associated with a message. |
| `message_attachments` | Channel/author-owned staged or published files, byte/type metadata, private storage path and removal/cleanup claims. |
| `read_receipts` | One monotonic sequence per channel/member, not separate thread receipts. |
| `message_link_previews` | Server-generated bounded URL/title/description/hostname text. |
| `private.message_moderation` | Message deletion actor/reason/action/time; not readable by ordinary clients. |
| Central reports/evidence/audit state | `private.moderation_cases`, `private.admin_audit` and associated administration media/history support scoped report review. |
| Voice state | `voice_rooms`, private admission/session/enforcement state, and LiveKit's actual media rooms. |
| Related social state | `friendships`, `member_blocks`, `member_privacy`, `conversations`, `direct_messages`, notification tables/preferences. Preserve their distinct policies. |

Primary schema sources: `202610230001_communities.sql`, `202610240001_messaging.sql` through `202610240007_account_message_cleanup.sql`, and later voice/People/notification/administration/launch migrations. Later migrations wrap earlier functions; inspecting only the original migration gives an incomplete authorization picture.

Existing indexes cover channel/category ordering, community membership, channel/thread message creation order, message revisions, authors, live attachments, receipt aggregation and GIN message search. Recent member-rail migrations add separate status/default behavior; do not silently revert these preferences during chat work.

### Roles and authorization

Community roles are owner (40), administrator (30), moderator (20) and member (10). They are fixed role IDs, not arbitrary Discord-style custom roles. Creation approval is separate operator-controlled state. Platform owner/administrator/moderator lives in `private.platform_roles`; **community ownership does not imply platform ownership**.

`channel_access(channel, permission)` checks current eligibility, membership and operational archive/disable gates. Community owner/administrator has the existing privileged channel behavior; lower ranks use the public/private channel rules and matching role/member overrides, with explicit denies taking precedence. Moderators do not acquire unrestricted private-channel access merely from their title. Ordinary channel edits require author identity and current post access. Deleting another author's message requires the existing community moderation rank and access checks; platform report moderation uses separately authorized administration transactions. Do not merge those permission paths in a client role check.

User data tables use RLS and ordinary direct writes are revoked. Mutations run through authenticated, validated RPCs, deriving the actor from `auth.uid()`. Privileged helpers use fixed search paths and explicit grants. UI buttons are convenience controls, not authorization.

### Messaging and Realtime flow

1. `ChatWorkspace` assigns a UUID per send attempt and calls `sendMessage` in `src/lib/chat/actions.ts`.
2. The server validates with Zod, authenticates independently and calls `send_channel_message`. PostgreSQL checks current access, body/root/files, budgets and stable-ID ownership, then commits the message and attachment claim atomically.
3. Database triggers call `realtime.send` inside the transaction; live delivery follows committed changes. Events carry IDs/invalidation data rather than histories or message bodies.
4. `/api/chat/session` verifies the authenticated user and channel, returning the private epoch topic plus the short-lived access JWT held in JS memory. Refresh tokens and service credentials are not exposed.
5. `useChannelChat` subscribes with Supabase `RealtimeClient` to `chat:<channel UUID>:<epoch UUID>` with `private: true`. Changes/receipts prompt bounded authoritative fetches; typing is server-originated through `/api/chat/typing`.
6. `reconcileMessages` merges HTTP, Broadcast and catch-up results by stable ID and exact bigint version. It preserves newer edits/tombstones and orders by server sequence, not browser clocks.
7. Permission changes rotate epochs. Access-change notices and 30-second session rechecks reconnect eligible clients or clear a revoked workspace. Cached subscription authorization is deliberately not trusted to revoke access alone.

History and thread pages are capped at 40 messages using creation-sequence cursors. Search is per accessible channel using PostgreSQL simple-token full text, not arbitrary substring search. Catch-up pages contain at most 200 changed rows; the hook caps catch-up at 20 pages and can reset to the latest history page. The UI reports actual Connecting/Live/Reconnecting/Disconnected/Offline/Access unavailable states. Unconfirmed sends remain retryable; there is no fabricated delivery or automatic offline outbox.

Own editing, own deletion, moderator deletion, reactions, replies, shareable message links, typing, unread counts/dividers and explicit Mark read exist. Deletion is a tombstone, preserving IDs and threads. Account deletion also retains necessary shared tombstone structure. Mention/reply notification triggers already exist in `202610290003_space_notifications.sql`; mention autocomplete and rich mention chips do not.

### Files, links and voice

Channel uploads use `/api/chat/upload`, private `message-files` storage and `/api/chat/attachments/[id]`. Limit: four files/message, 3 MB/file; text formats additionally cap at 512 KB. Supported types are JPEG/PNG/WebP/GIF, PDF and UTF-8 text/Markdown/CSV. Images are decoded, bounded, metadata-stripped and transformed to WebP; animated image support exists. Chat does not accept general video/clip uploads just because the social feed does. Documents download as attachments. Downloads reauthorize and use private/no-store responses; no public storage URLs are needed.

The preview action is explicit, HTTPS-only and server-fetched with public-address DNS validation/pinning, redirect revalidation and resource bounds. Raw HTML, tracking preview images and arbitrary embeds are not supported. Files are format-validated, not antivirus-scanned. Cleanup scripts reclaim staged/deleted/orphaned files; a design change must not delete live attachments as “unused.”

Voice is actual LiveKit WebRTC. `/api/voice/[operation]` authenticates, checks admission/rate limits and uses a server-derived room/identity. Tokens last 60 seconds, permit microphone media only, and deny recording/admin/arbitrary-room grants. The persistent provider manages audio/autoplay, microphone permission, mute/deafen/devices, participants, speaking/quality and reconnection. A separate `scripts/voice-worker.mjs` enforces later permission loss; freshness failure blocks admissions. Vercel request handlers are not a replacement for this always-on worker.

### Mobile and deployment

Mobile has bottom navigation, a collapsible application drawer and `ChannelNavigation`'s native channel dialog with modal behavior. Chat becomes one column at 700px, with a 50dvh timeline, smaller avatars and full-width send action. The member rail is hidden at narrower widths; member/profile navigation still works. Mobile voice controls and the installed PWA already exist.

`vercel.json` selects Next.js, `npm ci` and `npm run build`, with no `dist` output override. `next.config.ts` configures security headers, microphone permission, a 3 MB Server Action body limit and server-side Sharp handling. Upload handlers have their own streaming limits. `prebuild` validates environment and generates PWA assets/service-worker versioning. Authenticated HTML/RSC/API/media must remain outside public caching and the PWA cache.

Relevant configuration names are `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Inspect settings securely; do not print values. Private Supabase Realtime, Storage policies, SMTP, worker health and matching canonical origins remain deployment prerequisites.

## 2. What works, what is incomplete, and why it feels less like Discord

“Implemented” below means found in source with repository tests; it is not a certification of the live deployment.

| Area | Existing working foundation | Incomplete or different experience |
| --- | --- | --- |
| Navigation | Real community/channel IDs, active links, mobile dialog, authorization | Generic app sidebar dominates; no active-community channel workspace. Categories exist but are not passed into channel navigation. Existing `channel_unread_counts` is not wired to channel-row badges. |
| Conversation | Persistent ordered history, avatars, safe formatting, real updates | No consecutive-author grouping, date separators or local message timestamps; each row shows UTC. Large banner/heading plus nested panels reduce conversation space. |
| Layout | Responsive two-column channel page and independent scroll list | The timeline is a fixed/clamped portion of page height, inside a scrolling application page. Header, composer and panes do not yet share one viewport layout. Preserve the banner in a compact/collapsible treatment rather than removing it. |
| Composer | Multiline textarea, explicit send, retry, upload, typing | No Enter-to-send/Shift+Enter policy, IME-aware shortcut, auto-growing input, mention suggestion, emoji composer, paste/drop attachments or visual upload progress. Drafts vanish when the keyed channel workspace unmounts or refreshes. |
| Message controls | Edit/delete/reactions/report/copy-link, confirmations and error feedback | Every message permanently shows many text controls and read counts. No compact hover/focus toolbar, accessible overflow menu, message grouping or image lightbox. Fixed eight reaction choices, not a full picker. Author name/avatar is not a profile link here. |
| Replies/search | Root threads, reply targets, separate pagination, bounded search, message deep links | Opening a thread replaces the channel timeline. Search also replaces it. There is no simultaneous thread panel, contextual reply quote, search side panel or jump-to-present affordance. |
| Scroll/unread | Near-bottom guard, unread divider, manual older-page loading | No explicit prepend anchor restoration, new-message/jump banner or per-channel scroll restoration. Read state is channel-wide even when viewing a thread. Focus/visibility-based read semantics need targeted tests. |
| Members/voice | Real profile links, friends/member rail, real voice participants in voice panel | Channel tree does not show authorized voice occupancy/current room members or category collapse state. Member status is polled, not instantaneous Discord-style presence. |
| Scale/resilience | Cursor pages, stable ID/version reconciliation, retryable send | Loaded messages accumulate in one array and all rows render; no virtualization/window limit. General errors and connection/read/search work share a large component. |
| Extras | Existing mention/reply notification backend | No pin/bookmark model or comprehensive composer autocomplete was found. These are optional later features, not reasons to rebuild the schema. |

Code-level risks to reproduce before changing behavior (not confirmed production incidents): overlapping thread/search requests can overwrite newer paging state; shared draft/file state can carry across thread mode changes; channel-level read receipts may mark unseen roots read after a newer thread reply; prepend loading can shift the viewport. Switching edit targets after an uncertain send changes the logical operation ID, so retry UX must clearly distinguish an unchanged retry from a new message.

Some older documentation is stale: `docs/ARCHITECTURE.md` and parts of `docs/MESSAGING.md` describe direct messages/voice as disconnected, despite their later implementation. Use current routes, migrations, tests and recent `DEVELOPMENT_LOG.md` entries as evidence. No `PROJECT_BLUEPRINT.md` or `ROADMAP.md` was found in this checkout.

## 3. Features and invariants to preserve

- Every existing ID, community/channel/category/role/membership, message body/history/tombstone, attachment relationship and deep link. Do not reseed, recreate or rename identities as a styling shortcut.
- Supabase Auth/PostgreSQL/private Realtime and LiveKit. No parallel message store, public fallback subscription or simulated presence/voice.
- Atomic persistence before delivery, stable retry IDs, commit-order revisions, per-channel locks, bounded cursors, safe content rendering and epoch-based revocation.
- Existing view/post/connect distinctions, read-only/private/disabled channels, archived communities, role hierarchy, report/evidence access and auditing. An operational platform role is not an ordinary channel bypass.
- Private attachments, ownership/admission checks, safe previews, consent/notification controls and account-deletion behavior.
- Real typing/unread/search/thread/reaction/edit/delete/report functionality, including degraded-network and denied states.
- Uploaded community banners, member/friend profile links, online/offline/hidden status, public/on defaults and later member opt-outs.
- Persistent voice during internal navigation, microphone/deafen/device controls, moderator removal and worker enforcement.
- All other platform screens, faith/prayer privacy, events, Squad Up, social sharing, friend/DM isolation, administration, PWA install/update and accessibility.

## 4. Proposed component structure

Refactor in place under the existing member layout and routes; names below are proposals, not files created in Task 1.

```text
Existing AppShell / persistent providers
└── ChannelWorkspaceLayout (viewport sizing and responsive panes)
    ├── CommunityChannelSidebar
    │   ├── CommunityHeader / compact CommunityBanner
    │   ├── ChannelCategory (collapsible, stored category order)
    │   ├── ChannelRow (active/private/unread; view-authorized only)
    │   └── VoiceChannelRow (authorized occupancy; reuse voice actions)
    ├── ConversationPane
    │   ├── ChannelHeader (topic, search, members, drawer controls)
    │   ├── ConnectionBanner / ChannelEmptyState
    │   ├── MessageTimeline
    │   │   ├── DateDivider / UnreadDivider / MessageGroup
    │   │   └── existing MessageItem → MessageRow + action menu
    │   ├── JumpToPresent / TypingIndicator
    │   └── MessageComposer
    │       ├── ReplyContext / AttachmentTray / UploadStatus
    │       └── Emoji/Mention suggestions (later, authorized data only)
    ├── ThreadPanel OR SearchPanel (desktop; accessible mobile sheet)
    └── existing PeopleRail (optional width, profile navigation intact)
```

Keep existing global navigation available; a compact channel-workspace mode can reduce its width without removing access to Home, faith, events, friends, settings or administration. An active-community selector should reuse authorized joined-community data, not replace or reseed communities.

Keep `useChannelChat`, server actions, DTOs and `reconcileMessages` as the initial data contract. Extract presentation first. Later separate history/thread/search/composer state into small hooks with request-generation cancellation guards and explicit context keys. Do not re-create `VoiceProvider` in a page or remount it for drawer/panel changes.

Use keyboard-focusable controls with visible focus; hover actions must also appear on focus and remain available on touch. Mobile thread/search sheets require focus management, Escape/back behavior, adequate targets, safe-area spacing and keyboard/visual-viewport testing.

## 5. Required database changes

**None are required for the first visual/navigation stages. Do not create migrations during Task 1.** Categories, ordering, unread receipts, thread relationships, mentions, reactions and attachments already have models.

Reuse existing category/order fields and `channel_unread_counts` first. Changing the sidebar should not invoke community-management mutation commands. Frontend state for category collapse and optional drafts needs no server schema initially.

Only propose a separate, reviewed additive migration when a later approved feature demonstrates a requirement:

| Possible later change | Condition and safeguards |
| --- | --- |
| Per-thread read receipts/subscriptions | Only after deciding current channel-wide read semantics are insufficient; retain existing channel receipts and define exact aggregation rules. |
| Pins/bookmarks | Separate join table with unique scope, actor-derived authorization and moderation audit; not columns that replace message identity. |
| Draft synchronization/preferences | Optional owner-only state with retention/limits and explicit persistence consent; do not silently store sensitive drafts in browser storage or shared cache. |
| Edit conflict protection | Optional expected-version argument compatible with existing callers; never discard or overwrite content silently. |
| New indexes/batched projections | Measure `EXPLAIN (ANALYZE, BUFFERS)` only on isolated local/staging data; add indexes only for demonstrated query plans. Plan locking and rollback before production. |

No new message/thread table, provider migration, new public Storage bucket, role rewrite, destructive cleanup or historical backfill is needed to make the interface feel modern. Audit scripts/installers are not permission to rerun older setup. Never replay one-time public-default backfills over members' later choices.

## 6. Required backend changes

For the initial shell/channel tree, extend the **existing authenticated channel-page read** to include `category_id`, descriptions, private flags, ordered categories and authorized unread counts. Return a minimal typed projection; keep hidden channel existence hidden. The present route selects only `id,name,kind`, which is the immediate navigation obstacle.

Keep existing send/edit/delete/react/history/changes/read/upload/session/typing RPCs and endpoints unchanged while extracting components. Do not move service-role calls or JWT handling into visual components. A richer composer still submits the same validated body/file IDs and stable attempt ID.

Later, if measured load justifies it, add compatible bounded context/summary reads or conditional watermark checks instead of a second chat service. Membership capability responses should express current allowed actions rather than trusting labels cached in the client. Voice occupancy must use an authorized minimal projection, not unrestricted LiveKit room enumeration. Mention suggestions must respect blocks/discoverability/community context and existing notification opt-outs.

Keep reply/mention notification triggers functional. Do not implement broad `@everyone`/role pings by merely parsing text; that needs explicit permission/rate/notification policy. Video attachments, public embeds and expanded file limits require a separate backend/storage/security review and are outside the basic layout overhaul.

## 7. Security considerations

- Recheck Auth and live channel permission on every protected read/mutation/subscription. Rendered/disabled buttons are never the security boundary.
- Preserve RLS, explicit grants, fixed definer search paths and `auth.uid()` identity. Do not accept client actors, moderator roles, room names or grants.
- Keep invalidation events content-free and private. Supabase subscription authorization is cached; retain epoch rotation, reauthorization and access-loss clearing.
- Do not expose a private channel through search, tree placeholders, counts, voice participant previews, media or error messages.
- Keep raw HTML/executable URLs/remote Markdown images disabled. Preserve SSRF protections for explicit previews; do not enable automatic third-party embeds as a visual shortcut.
- Keep uploads bounded/type-validated and private. A lightbox must fetch the same authorized media route, with lazy loading and cleanup; image optimization/CDN configuration must not make authenticated bytes public.
- Preserve separate profile visibility, friend/community presence settings and hidden status. Public profiles do not grant private-channel, DM or private-prayer access. Do not confuse blocked profile/DM discovery with an already approved policy for hiding shared-channel content; confirm intended shared-channel block presentation before changing delivery/search.
- Prevent the PWA, service worker, browser persistence or shared caches from storing private chat/history/tokens/drafts without an explicit reviewed design.
- Keep reporting, moderation evidence retention, deletion tombstones and audit trails. Redact raw content, identities, secrets and private URLs from diagnostics.
- Never treat a client mute/deafen/hidden room as voice moderation; keep server removal and worker freshness gates.

## 8. Performance improvements

1. Fit the timeline/composer into a constrained viewport and preserve scroll anchors during prepend, edits and image loads. Add jump-to-present without stealing scroll when reading history.
2. Memoize message row/group rendering and index loaded messages by ID where useful; repeated `find`/filter/sort across all loaded rows and repeated full array reconciliation will grow with long sessions.
3. Measure before adopting virtualization. If needed, virtualize visible rows with stable keys, dynamic image heights and accessibility/search/deep-link support; define bounded retention and refetch behavior before evicting rows.
4. Coalesce invalidations as the existing 80ms debounce does. Avoid repeatedly fetching/rendering the latest full 40-message projection when only unread/permission metadata changed; do not sacrifice catch-up correctness.
5. Reuse a bounded community unread summary instead of one request/subscription per channel. Profile queries and avatar requests should not multiply per visual grouping.
6. Preserve existing history/search/change indexes. Benchmark DTO aggregation of reactions, attachments, read counts, reply counts, full-text search and current high-watermark queries on representative isolated data.
7. Retain commit-order locks until a measured alternative is proven. Channel writes serialize intentionally; a CSS overhaul must not remove the locks to claim throughput.
8. Lazy-load protected media and reserve dimensions to prevent scroll jumps. No public cache conversion of private files. Measure egress/memory before enlarging attachment limits.
9. Measure member-rail scope/polling and private Realtime connection counts. Do not subscribe every hidden channel or render the entire community roster/history eagerly.

No production capacity claim follows from bounded result pages: exact counts, DTO subqueries and membership filtering can still scan substantial data. Multi-region latency, hot-channel concurrency and media cost remain measurement gates.

## 9. Implementation order and exit criteria

Each stage requires a new explicit implementation instruction. Keep a reviewable commit per stage; use a local visual comparison or isolated staging route/flag if needed, never a replacement dataset.

| Stage | Work | Exit criteria |
| --- | --- | --- |
| 0 — baseline before implementation | Confirm deployed commit and pending migration history read-only; record UI at desktop/mobile widths; agree on compact banner, pane widths, send shortcut and read semantics. | Preserved-feature checklist and isolated two-account baseline; no production writes. |
| 1 — extract presentation | Split header/timeline/composer/action controls from ChatWorkspace without changing data behavior or providers. | Same IDs/routes/RPC calls; old messaging, denial, retry and voice-persistence tests pass. |
| 2 — channel workspace | Viewport layout, active-community sidebar, real ordered categories, private/read-only states, unread badges, compact retained banner. | Only authorized channels shown; mobile drawer works; no roster/history eager loading. |
| 3 — timeline polish | Group authors, local timestamps/date separators, compact focus/touch actions, scrolling anchors, jump-to-present, profile links. | Deep links, tombstones, older paging, images and keyboard/screen-reader use remain correct. |
| 4 — composer | Auto-size, defined Enter/Shift+Enter and IME handling, context-safe drafts, staged media/progress, keyboard reply/edit. | Persist-before-delivery, same-ID retries and failures verified; no duplicate sends. |
| 5 — thread/search panes | Desktop side panes/mobile sheets, independent draft/cursor/request state and focused reply context. | Parent timeline/scroll preserved; stale responses and read semantics explicitly tested. |
| 6 — optional enhancements | Authorized mention/emoji suggestions, lightbox, measured rendering optimization and minimal voice occupancy. | No widened privacy/subscriptions/storage; scale and keyboard/touch checks pass. |
| 7 — release | Full regression, reversible app rollback, operations docs and reviewed additive migrations only if required. | Obtain confirmation before production SQL or pushing/deploying live changes. Verify exact Vercel commit and hosted two-account acceptance; do not infer success from Git push. |

## 10. Test strategy and current verification

### Existing coverage to retain

- `src/lib/chat/chat.test.ts`: input bounds, bigint revisions/order, deduplication, safe links, image/file validation and preview boundaries.
- `src/lib/chat/actions.test.ts`: independent Auth, actor injection, commit-only results, permission/rate errors and bounded operations.
- `src/components/chat/SafeMarkdown.test.tsx`, `src/lib/chat/previews.test.ts`: HTML/URL/rendering and DNS/redirect/size/type protections.
- `scripts/test-messaging.mjs` (`test:messaging`): database access/mutations, idempotency/concurrency, threads, receipts, files and cleanup.
- `scripts/test-chat-realtime.mjs` (`test:realtime`): real committed delivery, rollback, private topic authorization/forged sends, revocation and catch-up.
- `e2e/messaging.spec.ts`: two authenticated browser contexts exchanging, threading, editing, reacting, attaching, reconnecting and losing access at desktop/mobile widths.
- Voice unit/route tests, `test:voice`, `test:voice:worker`, `e2e/voice.spec.ts`: scoped tokens, server moderation, actual decoded two-way audio, navigation persistence, reconnect and revocation.
- Community, People/DM, member-rail, admin, social, faith/events, account-deletion, media and PWA tests protect integrations outside chat.
- `e2e/interface.spec.ts` and axe/overflow assertions protect responsive/accessibility behavior. Current projects are desktop/mobile Chromium emulation, not physical phones or Safari certification.

CI (`.github/workflows/verify.yml`) runs Node 24 install, lint, types, unit tests, security scan, dependency audit, production build and client bundle scan on PR/manual dispatch. It does not automatically run the real local database/Realtime/voice/browser suites. Other workflows handle event reminders and moderation retention. The verification workflow is not a live deploy job; Vercel's existing Git integration deploys main.

### Tests to add with approved stages

- Focused ChatWorkspace/MessageItem/hook tests: pending/uncertain send, same-ID retry, denial clearing, lifecycle cleanup, stale thread/search responses and edit-during-live-update cases. The current suite has broad integration coverage, but no dedicated component/hook test file for these three main chat modules.
- Keyboard/IME send, Shift+Enter, focus-return/action menus, native/touch attachments, mobile virtual keyboard/safe areas and reduced-motion checks.
- Consecutive-author grouping across day/reply/deletion boundaries; local date/DST rendering; image layout and top-history anchoring.
- Separate thread/search state, rapid switching and revoked access; channel read versus thread read, initial unread jump, mark read and new-message indicators.
- Real two-account delivery under offline/reconnect/lost acknowledgement, duplicate Broadcast/refetch and role/ban changes; ensure no duplicate row or stale resurrection.
- Negative RLS/RPC/subscription/file tests for nonmembers, private channels, explicit denies, banned/suspended users, wrong attachment owner/channel and client-forged moderation actions.
- Check view/post/connect separately, including read-only reactions and admin-report versus ordinary community permissions.
- Actual voice while navigating new panels/categories/community/profile routes; mic denial/autoplay, moderator removal, worker outage and recovery. Never substitute simulated audio or tokens.
- Existing account/profile/privacy defaults and later opt-outs; no mutation of production accounts in tests.
- Isolated staging load/memory/network/query-plan checks before increasing limits or claiming scale.

After each approved implementation stage run lint, typecheck, relevant unit tests and the affected real integration/browser tests. Run a production build at milestones and the full established suite before release. Preserve test assertions for outcomes rather than weakening tests to match a redesigned selector.

### Audit-only execution record

Fresh checks in this audit: `npm run lint` passed; `npm run typecheck` passed; `npm test` passed **263 tests across 37 files**. No new tests or application implementation were written.

No SQL, seeds, cleanup, account creation, database/browser fixture suites, production build/prebuild, hosting change, publish or deployment was run for this audit. The build pre-step rewrites tracked PWA version assets, so a documentation-only audit deliberately avoided it. Earlier logs record real database/Realtime/WebRTC/browser verification, including a 90-scenario regression, but those runs are historical evidence, not a fresh hosted certification.

## 11. Known risks and major obstacles

1. **Provider replacement is unnecessary.** The existing architecture supports the proposed interface. The substantial work is safely separating coupled UI state and reducing page chrome without breaking persistent providers.
2. **Migration/deployment drift must be checked before implementation/release.** Repository migrations do not prove which versions are installed on hosted Supabase. Never solve drift by resetting schemas, replaying setup or deleting existing records. This audit did not access production migration history.
3. **Realtime correctness is easy to regress.** Cached subscription access, epoch rotation, commit-order locks, stable operation IDs and tombstones are intentional security/delivery mechanisms, not incidental implementation detail.
4. **Voice depends on an independent healthy worker.** A layout change cannot cure missing/mismatched LiveKit credentials, a stale enforcement heartbeat or unsupported background mobile media. Do not bypass the enforcement gate to make join look successful.
5. **Read/thread/draft behavior needs a deliberate contract.** Current channel-wide receipts and shared composer mode can diverge from Discord expectations. Reproduce the identified races and agree on semantics before any data-model change.
6. **Scale and physical-device acceptance are unproven.** No virtualization, large-room load certification, full mobile keyboard matrix, Safari sign-off or background voice guarantee is established by source review/Chromium emulation.
7. **Existing security/operations gates remain.** `docs/SECURITY_REVIEW.md` records unverified rotation of a previously exposed server credential, hosted acceptance/backup recovery, worker monitoring, malware scanning and legal/privacy review. Do not reproduce credential values or claim these are resolved from source scans.
8. **Documentation lag and global CSS increase regression risk.** Cross-reference current code/migrations and recent logs; scope new classes to the channel workspace and preserve other pages. Do not treat older disconnected-service descriptions as permission to replace working features.

**Recommendation:** after approving the plan, begin with Stage 0 and behavior-preserving component extraction. Keep the current database/providers and ship small reviewed stages. There is no audit finding requiring a rebuild, data purge or immediate destructive migration.

## Stage 2 implementation follow-through

The later Stage 2 user request explicitly authorized the workspace implementation, including timeline grouping/day separators and member grouping. See `docs/CHAT_WORKSPACE.md` and the development log for the final behavior and verification. Existing chat/voice providers and data were retained. Categories/unreads reuse existing data; two additive read projections provide scoped mention counts and grouped member role/presence data without recreating tables. Remaining later-stage items (simultaneous thread/search panes, keyboard-send policy, persistent drafts, virtualization) are not represented as completed.
