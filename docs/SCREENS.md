# Phase 2 screen inventory

All screens use deep navy surfaces, purple/indigo branding, cyan accents, locally bundled DM Sans and Manrope typography, rounded panels, and reduced-motion-aware transitions. All sample information is labeled development/demo content.

| Screen                  | Route                                       | Completed interface and behavior                                                                                                           |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Landing / welcome       | `/`                                         | Brand, welcome art, values, discover/faith links, and entry into the preview                                                               |
| Home dashboard          | `/home`                                     | Welcome, illustrated hero, quick destinations, community cards, sample upcoming events, real-feed entry, permission-based real friends rail                 |
| Text channels           | `/channels`, `/channels/:channelId`         | Community navigation, five linked channels, sample general conversation, empty channels, pinned guidance, mobile drawer, disabled composer |
| Voice lounge            | `/voice`                                    | Three demo rooms, sample participants, voice etiquette, disabled join controls, explicit disconnected status                               |
| Communities / discovery | `/communities`, `/communities/:communityId` | Six sample communities, text search, category filter, clearable no-results state, community details and channel links                      |
| Squad Up                | `/squad-up`                                 | Real session discovery, scoped creation, approvals, player limits, filters, game nights, block management and private group voice                                           |
| Social feed             | `/feed`                                     | Personalized real posts, private photos/clips, audiences, comments/reactions, follows and scoped reporting                                      |
| Events                  | `/events`, `/events/:eventId`               | Category filters, three demo events, detail pages, America/New_York times, screen-local bookmark, disabled RSVP                            |
| Faith & Life            | `/faith`                                    | Three selectable reflection topics, scripture, prayer-channel link, sample Sunday gathering link                                           |
| Friends / messages      | `/messages`, `/messages/:conversationId`          | Real friendships/requests, opt-in username and shared-interest discovery, private live DMs with paginated history, reports, mute/unread counts, friend notifications and contact privacy                            |
| Member profile          | `/profile`                                  | Cover, demo identity, bio/interests, sample communities, validated local profile editor                                                    |
| Settings                | `/settings`                                 | Appearance sample, notification/privacy preferences, unavailable account state, browser-only save/restore, storage failure feedback        |
| Admin shell             | `/admin`                                    | Overview placeholders, Members/Moderation/Communities sections, no-data states, explicit authorization boundary, disabled admin actions    |

## Shared navigation and accessibility

- Desktop: collapsible left sidebar, community/channel navigation, main workspace, and online-friends rail at 1400px and above. The desktop sidebar scrolls when needed.
- Mobile: bottom navigation, persistent disconnected voice strip, full navigation drawer, and independent channel drawer. Drawers trap keyboard focus, support Escape, and return focus to their trigger.
- Semantic navigation, one page-level heading per primary screen, skip link, route titles, visible keyboard focus, input labels, textual status descriptions, and 44px principal mobile controls.
- Main content receives focus after in-app route navigation. Initial loading preserves the skip link as the first keyboard stop.
- Reduced-motion system preference disables decorative animation and transitions.
- Unknown routes and invalid community/channel/event/friend identifiers have explicit recovery states.
- Lazy initial application loading has an announced loading state. Rendering failures reach a reloadable error boundary. Unconnected features show explanatory unavailable states instead of fake network requests or artificial loading.

## Reusable components

`AppShell`, `Sidebar`, `Topbar`, and `MobileNavigation` live in `src/components/AppShell.tsx`.

`ProfileAvatar`, `OnlineStatus`, `CommunityCard`, `ChannelList`, `VoiceRoomCard`, `FeedPost`, `EventCard`, `NotificationBell`, and `EmptyState` live in `src/components/ui.tsx`, alongside shared headings, demo/service notices, loading/error states, and the voice connection bar.

`ErrorBoundary` provides application-level rendering recovery.

## Phase 3 account screens (supersede Phase 2 demo profile/settings)

All member workspace routes now require a verified Supabase user; community routes also require completed onboarding. The remaining game/community activity is still explicitly demo content. The profile and settings rows above describe historical Phase 2 behavior; the following flows are the current implementation.

| Screen                 | Route                             | Current behavior                                                                                                               |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Registration           | `/register`                       | Email/password, eligible birth date, explicit 18+ confirmation, actual verification email, generic anti-enumeration response   |
| Sign in                | `/login`                          | Server-validated password login, safe next destination, verified identity, persistent HttpOnly sessions                        |
| Recovery               | `/forgot-password`                | Real recovery email and existence-neutral response                                                                             |
| New password           | `/reset-password`                 | Authenticated recovery, password confirmation, refresh-session revocation and sign-in again                                    |
| Verification           | `/auth/confirm`, `/auth/callback` | Token-hash or PKCE verification with no-store responses and safe redirects                                                     |
| Member onboarding      | `/onboarding`                     | Three responsive steps: private-by-default identity; game/platform selection; private interests. Atomic save and route to home |
| Own gamer profile      | `/profile`                        | Real handle/name/bio, favorite games/platforms, interests, visibility, safe avatar upload, visible-profile link                |
| Account settings       | `/settings`                       | Server-persisted private preferences, reauthenticated password change, confirmed/reauthed deletion, real error feedback        |
| Visible member profile | `/people/:username`               | Minimal public/member/owner projection, private-avatar streaming, generic unavailable state                                    |

The dashboard and sidebar use the current member’s name, handle, and avatar. Selection controls have stable accessible names, step buttons avoid premature native submission, and typed profile values are preserved during server validation feedback. No credential values are rendered in page content. Exact Supabase requirements and security limits are documented in `SUPABASE.md`.

## Phase 4 community screens

The Phase 2 community/channel previews are superseded on their real routes:

| Route | Connected behavior |
| --- | --- |
| `/home` | Real accessible community cards, a link to the member feed, and labeled sample events |
| `/communities` | Database-backed discovery, text search, joined filter, approved-host creation, empty/unavailable states |
| `/communities/:slug` | Cover artwork and descriptions, join/leave, ordered categories/text/voice definitions, explicit roster |
| `/communities/:slug` host settings | Community settings, category/channel editing and ordering, individual/role overrides, role changes, ownership transfer, member moderation, invitation issue/revoke, security activity |
| `/communities/invites/:token` | Verified single-use invitation acceptance; private details stay hidden until joining |
| `/channels` | Central Gathering community entry |
| `/channels/:uuid` | RLS-constrained channel definition, desktop navigation/mobile modal drawer, disconnected text composer or voice control |

Legacy `/channels/general` and other channel-name links resolve only through an accessible channel in The Gathering; nonmembers see a join-community prompt. Private UUID routes return the same not-found state as missing channels. Covers are four bundled original SVG landscapes. There are no simulated messages, voice connections, membership counts, or member activity on connected community pages. See [COMMUNITIES.md](COMMUNITIES.md) for visibility and role semantics.

## Phase 5 messaging screens

`/channels/:uuid` now renders a real persistent text workspace: live/connecting/offline/retry states, 40-row keyset history pages, root/thread replies and targets, emoji reactions, own editing/deletion, moderator deletion/reasons, member avatars with visibility-aware fallback, UTC timestamps, safe Markdown, current-channel search, unread dividers/counts, aggregate read indicators, and explicit mark-read.

The composer stages up to four validated private photos/GIFs/files, preserves an unconfirmed send ID for retry, and only clears after a committed response. Message links load/highlight an authorized row; link-preview cards are generated on explicit request without third-party images/embeds. Voice channel definitions and direct-message previews retain unavailable send/join controls. See [MESSAGING.md](MESSAGING.md) for exact limits, access/cache behavior, setup, and verification.

## Phase 6 connected voice screens

- `/voice`: authenticated community voice room discovery, actual provider occupancy when available, room capacity/lock state, initial Lounge/Squad Up/game rooms, private room links, and honest missing-infrastructure/empty/error states.
- `/channels/:id` for a voice channel: microphone or muted joining, real connection/reconnection status, microphone and output device selection, mute/deafen/leave, actual participant identities, speaking and connection quality indicators, moderator removal, and owner/admin room controls. Browser permission denial and autoplay recovery are explicit.
- Persistent desktop/mobile voice bars use the same member-layout connection while navigating. Existing text threads, uploads, profiles, invitations, settings and sample service labels are retained.
- See `VOICE.md` for production prerequisites and the required two-physical-device acceptance check. Automated browser media checks use actual LiveKit/WebRTC with deterministic microphone input.

## Phase 7 social screens

`/feed` is the real personalized feed and composer, with audience/community/interest filters, private media, reactions/comments, follows, report status and scoped moderation. `/feed/:id` opens an authorized permalink. `/communities/:slug/posts` opens a membership-only community feed. All three provide explicit loading, empty and error states, keyboard controls and responsive layouts. See [social setup and behavior](SOCIAL.md).

## Phase 8 Squad Up screens

`/squad-up` now provides real gaming session cards and creation, discovery/My sessions/game-night filters and private block management. `/squad-up/:id` handles joining, approval, roster, withdrawal, host removal/cancellation, schedules/expiry and the group’s real voice room. Community details link to scoped game-night listings. The persistent voice bar returns to connected group rooms. Missing and unauthorized sessions share one unavailable screen. See [SQUAD_UP.md](SQUAD_UP.md).

## Phase 9 production screens

- `/messages`: Friends (pending, incoming and accepted relationships), Discover (opt-in usernames and shared interests), Conversations (muted and unread counts), Notifications, Privacy and Blocks.
- `/messages/:conversationId`: participant-only Markdown-safe messages, timestamps, pagination, live updates, offline/reconnect/retry feedback, privacy rejection and abuse reports.
- Shell: real friends with permission-based presence; notification bell links to real friend updates and suppresses muted conversation badges.
- `/settings`: direct entry to discovery/contact privacy. Friends-only Squad Up now uses accepted friendships.

## Phase 10 production screens

- `/faith`: community-scoped prayer submission, explicit confidentiality guidelines, community/private-to-moderators visibility, optional curated daily KJV Scripture, permitted request listing and pagination.
- `/faith/:id`: fresh-authorized request detail, comments, private encouragement, owner edits/status and scoped sensitive-request moderation.
- `/events`: real community gatherings, category/community filters, locally rendered banner choices and event creation.
- `/events/:id`: local/event-zone times, own RSVP, linked resources without access grants, host/staff updates and cancellation.
- `/notifications`: recipient-only generic in-app updates, read controls, nine preference controls, opted-in friend/community/game invitations and separately authorized private moderator notices.
- Home now shows real accessible upcoming community events. The notification bell merges permitted updates with unmuted DM counts; Settings reminder changes synchronize with notification preferences.

### Phase 11 — live administration and safety

- `/admin`: real scoped overview, member status/roles, protected reports, communities/settings, channel order/access/disable, voice removal, event visibility, announcements, appeals and audited history. Ordinary members receive a staff-access empty state.
- `/reports`: server-authorized message/post/member/session reports; direct links prefill visible target identifiers. Existing social/DM reports join the central queue.
- `/appeals`: own appeal submission, with an explicit operator route for restricted accounts unable to authenticate.
- `/home`: real published, unexpired audience-scoped announcements.

### Phase 12 — release preparation

Removed development-only fallback screens and fabricated content. Unknown routes use the real 404 boundary. Home uses the device date; account deletion explains transfer/retention requirements. Added public review drafts at `/terms`, `/privacy`, `/community-rules`, public liveness `/api/health` and secret-authorized dependency health `/api/ops/health`. Administrative members now support sequence cursor pages.

## Custom community headers

Community settings now include owner/administrator header upload, replacement and removal. Uploaded headers appear in the community hero and Discover cards. See [header images](COMMUNITY_HEADERS.md) for requirements and deployment.

## Community management additions

Admin → Communities includes platform-controlled display order and confirmed permanent deletion for platform managers or the selected community owner. Home and Discover follow the shared order while retaining their existing audience restrictions. See [setup and permissions](COMMUNITY_MANAGEMENT.md).

## Installable PWA

`/install` provides native installation when offered and manual iPhone/iPad, Android and desktop instructions. Home/welcome/settings link to it. A generic offline reconnect screen and manual worker-update controls preserve the app’s private-data boundary and avoid automatic voice disconnection. See [PWA documentation](PWA.md).

## Email verification recovery

`/verify-email` shows safe failure reasons, a rate-limited resend form and sign-in/password-recovery choices. Login and registration link to it. Admin member rows clearly label missing profile setup without treating active status as email verification. See [hosted setup and recovery](EMAIL_VERIFICATION.md).

## Member lists and friendships

Members navigation and community pages offer membership-scoped lists with search, roles, pagination and direct friendship actions. Desktop rails link compact identities to profiles. See [member list setup and privacy](MEMBERS.md).

## Community banners in channels

Text and voice channel pages show the community's uploaded header above the channel heading, using the same responsive banner component as the community information page. Communities without an uploaded header use their default cover artwork. Images retain the existing authenticated, private/no-store delivery; no new database migration or configuration is required.

## Compact friends and online members

The right rail uses avatar/name links with online/offline/hidden-status dots under Friends and Members on all authenticated screens, including text and voice channels. `/members/[id]` shows an authorized member profile with friend controls and permitted profile details. Friends & messages → Privacy adds a separate control for community online status (on by default). See [setup, privacy and usage](PEOPLE_RAIL.md).

Profiles and both presence settings now default to public/on; the one-time existing-account update and member opt-outs are documented in [the defaults update](PEOPLE_RAIL.md#public-profile-and-presence-defaults-update).
