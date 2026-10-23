# Phase 2 screen inventory

All screens use deep navy surfaces, purple/indigo branding, cyan accents, locally bundled DM Sans and Manrope typography, rounded panels, and reduced-motion-aware transitions. All sample information is labeled development/demo content.

| Screen                  | Route                                       | Completed interface and behavior                                                                                                           |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Landing / welcome       | `/`                                         | Brand, welcome art, values, discover/faith links, and entry into the preview                                                               |
| Home dashboard          | `/home`                                     | Welcome, illustrated hero, quick destinations, community cards, upcoming events, sample feed, optional online-friends rail                 |
| Text channels           | `/channels`, `/channels/:channelId`         | Community navigation, five linked channels, sample general conversation, empty channels, pinned guidance, mobile drawer, disabled composer |
| Voice lounge            | `/voice`                                    | Three demo rooms, sample participants, voice etiquette, disabled join controls, explicit disconnected status                               |
| Communities / discovery | `/communities`, `/communities/:communityId` | Six sample communities, text search, category filter, clearable no-results state, community details and channel links                      |
| Squad Up                | `/squad-up`                                 | Game/platform filters, optional sample listings, empty state, disabled live posting and requests                                           |
| Social feed             | `/feed`                                     | Topic filtering, sample posts, reversible local reactions, disabled publishing, no fabricated replies                                      |
| Events                  | `/events`, `/events/:eventId`               | Category filters, three demo events, detail pages, America/New_York times, screen-local bookmark, disabled RSVP                            |
| Faith & Life            | `/faith`                                    | Three selectable reflection topics, scripture, prayer-channel link, sample Sunday gathering link                                           |
| Friends / messages      | `/messages`, `/messages/:friendId`          | Searchable sample friends, individual conversation layouts, empty and unknown-friend states, disabled messaging                            |
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
| `/home` | Real accessible community cards; sample feed/events remain labeled |
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
