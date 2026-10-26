# Faith Circles blueprint

Prepared October 26, 2026, **before implementation**. Existing baseline: `a85c9ef`.

**Faith Circles — Grow in the Word. Grow Together.**

## 1. Scope of the authorized foundation

The request authorizes an architecture blueprint followed by the foundation and initial Faith Circles UI. Implement an explicit community-backed Circle registration/read model, approved-leader gate, responsive landing/detail pages and actual links/actions into existing membership, channels, Hangouts, events, members and prayer. Do not rebuild those systems or automatically turn existing faith-themed communities into Circles.

Full lesson authoring, the interactive seven-step study session, persisted personal responses/completion, Bible-text API integration, leader self-service publishing/approval dashboards and new notification delivery are **later stages**, specified below. The foundation must not show fictitious lessons, progress percentages, saved responses, connected participants or successful publishing. “Continue Studying” initially revisits a joined Circle's actual current-study overview and explicitly says saved lesson progress is not connected yet.

No destructive migration, production SQL, seeding of real communities, deployment or release is authorized. Additive local/test migration execution is permitted to verify the foundation. Public launch still requires the existing 18+ verified/onboarded identity.

## 2. Existing architecture and reuse

| Existing system | Inspected source | Integration |
| --- | --- | --- |
| Next.js App Router/React/TypeScript | `app/(members)/layout.tsx`, `src/lib/auth/session.ts`, installed Next docs | New member routes `/faith-circles`, `/faith-circles/[id]`; use existing verified Auth and persistent layout, not a second app/provider. |
| Communities/privacy/covers | `src/lib/communities`, ordered community/header/management migrations | Circle has a one-to-one association with an existing community UUID. Name, description, public/discoverable/private visibility and authenticated header image come from that community. Existing communities are not renamed/reclassified/recreated. |
| Membership/roles/invitations | `community_members`, `community_roles`, `community_command`, member directory | One membership source. Join/leave/invite/ban/ownership and owner/admin/moderator/member roles remain existing transactional operations. No parallel Circle membership table. |
| Channels/chat/threads | ChannelWorkspaceLayout, `src/lib/chat`, channel permission/search/reliability migrations | Explicitly link a same-community text channel; only return it when `channel_access` permits view. Existing stable messages, replies, attachment routes, private epoch Broadcast, moderation/read state remain authoritative. |
| Live voice | VoiceProvider, VoiceControls, existing LiveKit endpoint/enforcement worker | Explicitly link a same-community voice channel; only return links when connect permission allows. Open the existing room UI; it issues tokens after existing server checks. Do not mount another media provider or simulate a participant/session. |
| Profiles/blocks | `visible_profile`, `private.people_card`, member/People privacy helpers | Leader identity must follow existing profile/roster visibility. A mutual block with the leader suppresses the new Circle surface. Existing chat/People protections remain; no emails, DOB or raw avatar paths in Circle DTOs. |
| Events/Gatherings | `events`, event RSVP/access APIs, Spaces/ZonedTime | Show only accessible future scheduled events linked to the Circle's configured voice room. Detail/RSVP/host permissions stay in existing events. Schedule note is human-readable, not an invented recurring-event engine. |
| Prayer/encouragement | `/faith`, Spaces, `prayer_requests`, `private.prayer_allowed` | Link the existing workspace with an authorized community selector. Its existing community/private-to-moderators choice, blocks, consent, encouragement/comments, audits and opt-outs apply. Do not expose private prayer text in Circle cards or notifications. |
| Administration/moderation | platform roles, community settings/audits, reports, appeals, room/channel management | Platform roles stay separate from Circle leadership. Existing community archive/ban/disabled channel access immediately gates fresh Circle reads. Existing report targets handle messages, members, sessions/posts; no new unmoderated chat. |
| Lounge shell/PWA/design | semantic tokens and premium styles, member layout, private-cache exclusions | Reuse navy/purple/cyan panels, genuine uploaded covers, rounded cards, visible focus and responsive drawers. Keep active voice across Circle/chat/profile/event navigation. No authenticated content in PWA caches. |

`PROJECT_BLUEPRINT.md` and `ROADMAP.md` are absent in this checkout; current source, migrations, AGENTS, premium/chat plans and recent executed development-log evidence are authoritative for this audit. Earlier documentation about disconnected services is not taken as current behavior.

## 3. Foundation data model

Only add:

- `private.faith_circle_leaders`: `user_id` (Auth FK), `approved` boolean default false, trusted operator approval timestamp. RLS enabled, no normal client read/write grants. Approval grants no platform/community role. Initial approval/registration is a trusted operator workflow, not a public/self-service endpoint.
- `public.faith_circles`: `community_id` PK/Auth-independent community FK, nullable `leader_id` Auth FK, optional same-community `discussion_channel_id` and `hangout_channel_id`, `study_title`, `passage_reference`, `schedule_note`, `featured`, `enabled`, timestamps. Name/cover/description/privacy stay in existing communities.
- Approval and channel-kind/community validation trigger; limited metadata audit events in existing community audit history. Leader account deletion sets the reference null and disables only Circle metadata; it must not block account deletion or delete the community/chat. Channel deletion clears optional references; disabled/archived/denied channels are also hidden on every fresh projection.
- Indexed Circle lookup and feature/leader selection as appropriate; bounded cursor-based directory reads. Revoke client table grants and use authenticated DTO RPCs with current permission checks. RLS default-denies direct metadata/preapproval access, including raw linked private channel IDs. Publicly discoverable Circle metadata does not imply access to channel IDs, member lists, events or conversations.

Registered Circle listing metadata may include its approved leader's current study title/reference and schedule note. Private Circle metadata is visible only to active members. Do not infer registration from a name, interest category or Christian wording. Do not seed/associate existing communities automatically.

### Later study model (not foundation migrations)

- `circle_studies`: Circle FK, title, overview, author, draft/published/archived state, revision and publication audit; only approved current leaders with appropriate community administration may publish.
- `circle_sessions`: study FK, ordered session number, passage reference, original/licensed overview, reflection prompts, personal application and prayer prompt, optional authorized room/event links. A publishing transaction validates leader, membership, revision and all linked resources.
- `circle_study_progress`: unique `(user_id, session_id)`, status/bookmark, session revision, completion timestamps; owner-only RLS plus current Circle/session access. Stable mutation IDs prevent retries producing duplicate completion events.
- `circle_personal_responses`: owner/session/prompt/revision, private answer, updated timestamp, explicit retention/deletion rules. Never publicly readable or automatically available to moderators. Do not copy personal responses into chat, reports or notifications without the member's explicit action.
- Session group discussion links to existing messages/threads by stable IDs; no second message database. New session/progress mutation APIs reauthorize membership, validate input server-side, enforce quotas and use transactions. Define behavior for a revised lesson and membership loss before shipping.

## 4. Privacy, leadership and safety

- Verified/onboarded/live actor required for all Circle RPCs. Auth identity is `auth.uid()`, never client-provided actor/role.
- Current leader must be explicitly approved, live and an active member of that same community. Revocation/deletion, community archive or leader/member suspension stops new Circle access. A banned community member cannot discover that Circle through an alternate route.
- Public/discoverable communities may expose approved listing metadata under the existing community visibility gate. Private community existence/name/metadata is absent for nonmembers. Nonmembers never receive private discussion/voice IDs, roster counts or event contents through a Circle DTO.
- Members see only links that pass the existing channel view/connect check, including explicit denies, disabled/archive/delete state and same-community/kind checks. Moderator badges or a visible button never authorize actions.
- Leader roster identity is available to fellow members under existing roster rules; nonmembers see identity only when the existing profile projection permits it. Private profile identity is not republished as an open directory listing. Mutual blocks suppress new Circle metadata and existing member/content APIs continue enforcing their own blocks.
- The initial metadata registration path is trusted operator SQL only. The public app has no create/edit/publish/grant endpoint. Database checks still reject unapproved/out-of-community leaders and mismatched channels. Later leader publishing must have server and transactional database checks, consent-aware notifications, rate limits and audit reasons; no client-controlled arbitrary administrator creation.
- Prayer stays in the existing system. “Private to moderators” means the author and currently authorized, unblocked moderators of that community—not a public Circle or generic all-staff feed. Explain this in the UI; do not promise end-to-end encryption.
- Existing reports/moderation history cover current user-generated discussion/prayer and member abuse. A future study-content report target, review queue and lesson withdrawal/evidence policy must be added before general member publishing; a member report link is not falsely described as reporting unpublished study content.
- No translation text is embedded by this feature. Begin with references and members' own Bibles. Do not reuse a translation merely because a previous component calls it public domain: translation/jurisdiction/license approval must be explicit for the future Bible API.

## 5. API integration plan

Foundation: existing Supabase SSR Auth/PostgreSQL RPC/RLS, existing authenticated cover/avatar endpoints, community membership commands, private messaging/Broadcast, Spaces/event/prayer endpoints and LiveKit. No new third-party API key or Bible provider is required.

Future Bible API: choose a licensed provider/translation after license, territory, attribution, caching/storage and accessibility review. Fetch only server-side through a configured allowlisted base URL; validate book/chapter/verse ranges, bound content and timeouts; never accept arbitrary remote URLs or expose a provider secret. Distinguish missing translation/provider/unavailable content from an empty passage; do not generate substitute Scripture text. Faith Circles must keep working with passage references if the provider is unavailable.

## 6. UI/component plan

- `FaithCirclesPage`: branded hero/tagline; featured actual study references; Explore (paginated); My Circles; Continue Studying (actual overview links, explicit progress limitation); accessible upcoming study-Hangout event links; prayer/encouragement access.
- `CircleCard` / `ScriptureReferenceCard`: existing community cover, approved visible leader where permitted, privacy and current reference/overview action; no fictional authors, stats or percentage bars.
- `CircleDetail`: cover/name/description, leader/privacy, real join/leave/invitation/community settings shortcuts, current study reference, schedule note, permitted discussion/Hangout links, actual member-directory link and scoped prayer/Gatherings access.
- Loading/empty/error/unavailable states, mobile single-column cards, keyboard focus and touch controls. New navigation entry, existing community context reuse and safe login return paths. Do not replace Faith & Life.
- Later `StudySession`, `ReflectionQuestions`, private response editor/autosave status, progress/continue list, revision conflicts and group thread panel. They remain unimplemented until their data/privacy contract is approved; no inert “Save response” UI.

## 7. Implementation stages and approval boundaries

1. **This blueprint, before building:** inspected architecture and documented preservation/integration/safety scope.
2. **Authorized now — foundation/initial UI:** additive registration/read model; trusted approved-leader association; bounded safe projections; landing/detail/navigation; links/actions into real existing services; reference-only current study cards; real empty/error states. Local migration/security/browser tests and setup/limitations documentation.
3. **Later — publishing/approval management:** scoped staff dashboard, approved-leader self-service draft authoring, transactional publish/revision/archive, study-content reports and moderation. No public publish shortcut in stage 2.
4. **Later — full study sessions:** seven-part session interface and private persisted progress/answers with isolated access tests, deletion/retention and revision semantics. Notify only according to existing preferences; no private answer/prayer text in notices.
5. **Later — optional licensed Bible integration:** provider choice/license approval before displaying translation text.
6. **Release:** review completed code/tests and required migration; explicit approval for production SQL and deployment. Guarded installer skips recorded reruns and refuses ambiguous pre-existing objects. Back up first; rollback application compatibly, not by deleting community/member/study data.

## 8. Tests and acceptance criteria

Foundation tests must actually execute:

- Landing/sidebar/mobile navigation, login return path and deep links work; unavailable database update produces an honest service state, not fake Circles.
- Real public/private/discoverable Circle metadata visibility, join/leave using existing membership, private direct-route 404, no unauthorized channel IDs/rosters/schedule leakage, blocked/banned/suspended/unverified/anonymous rejection.
- Direct client metadata/leader-approval writes denied; unapproved or out-of-community leaders and cross-community/wrong-kind channel references rejected. Leader/member revocation and deleted account/channel lifecycle remain safe.
- Leader identity honors profile/roster privacy. Optional headers use existing private routes. References contain no embedded translation text.
- Real directory cursor pagination, featured/mine filtering and empty states. Existing community/chat/private-room/report/prayer/event tests still pass. Circle links open the existing channel/room UI and persistent audio remains under the member layout.
- Existing private prayer and block/moderation isolation tests run; changing the community query parameter cannot grant prayer access.
- Desktop/tablet/mobile overflow, axe, visible focus and clear permission-aware controls. Real browser service tests, not simulated chat/audio success.
- Lint, typecheck, full unit suite, relevant local authorization/integration/browser suites, production build and bundle/source secret scans. Document counts/failures honestly and do not claim physical devices or hosted readiness from local Chromium.

Future study-session acceptance additionally requires two-account progress/answer isolation, transactional retry/duplicates/concurrency, denied nonmember subscriptions, response deletion/retention, report/audit access and licensed-source attribution/error handling. A reference card alone does not satisfy those later requirements.

## Foundation implementation notes

Implemented the explicit community association, protected leader approval, safe Circle listing/detail projections and a bounded scheduled-Hangout projection. Existing events do not grant direct authenticated table access in the current application; the new read RPC respects existing event/channel authorization rather than widening those grants. Added an index for scheduled community/voice-room/start-time lookups.

Implemented `/faith-circles` and `/faith-circles/[id]`, shared Circle/reference cards, cursor-based exploration, existing community join/leave controls, permitted discussion/voice links, scoped prayers/events and joined-community shell context. No production communities were created or classified. See `docs/FAITH_CIRCLES.md` for registration, release steps and remaining scope. Detailed guided sessions, persisted study progress/responses and self-service publishing remain unimplemented by design in this initial foundation.
