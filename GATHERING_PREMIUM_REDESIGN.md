# The Gathering 2.0 — Premium Digital Lounge foundation

Phase 1: repository audit, reference interpretation, proposed design system and implementation plan.
Review date: October 25, 2026 (America/New_York). Repository baseline: `395389e`.

**Status: planning only.** The reference supplied in this request was visually reviewed. Tokens below are a proposed semantic CSS specification inside this document; they are **not loaded into the app**. No UI, authentication, provider, schema, community/member/message data or production configuration is changed. No migrations, fixture setup, reseeding, publishing or deployment are authorized by this design audit.

## 1. Brand and product direction

- Primary name: **The Gathering**.
- Tagline: **Find Your People. Find Your Place.** Use this capitalization consistently in brand-facing copy.
- Positioning: a welcoming community platform for shared interests, conversation, events, activities and live voice hangouts. Gaming remains a first-class category and retains Squad Up, games/platforms and existing game communities; it no longer defines every hero, icon and onboarding assumption.
- Preserve Faith & Life, prayer privacy, kindness/respect guidelines, existing Christian community identity and member choices. Broader community participation is not authorization to remove faith features or change eligibility/privacy policy.
- Tone: warm, confident and spacious in discovery; clear and compact in conversations. Avoid invented attendance/activity statistics, fake members, simulated connection states or decorative controls that imply unavailable services.

## 2. Existing architecture: source audit

| Area | Current implementation | Redesign implication |
| --- | --- | --- |
| Framework | Next.js 16.4.2 App Router, React 19, TypeScript; Node 24. `app/layout.tsx` imports local font packages and `src/styles.css`. Vite config is for Vitest, not the production framework. | Keep Next routing/server actions and the current package stack; no rebuild or second router. |
| Shell | `src/components/AppShell.tsx` exports Sidebar, Topbar and MobileNavigation and contains FriendsSidebar; navigation definitions are in `src/data.ts`, with Next adapters in `src/compat/navigation.tsx`. | Extract/recompose presentation incrementally; Sidebar/Topbar are not currently separate files. Preserve existing routes and navigation behavior. |
| Provider lifetime | `app/(members)/layout.tsx` verifies Auth, loads the profile, then mounts MemberProvider → VoiceProvider → PeopleProvider → AppShell. Root layout owns PwaProvider. | These boundaries stay mounted during navigation. Never move VoiceProvider inside a selected community/page or introduce another media capture. |
| Design system | One 6,680-line `src/styles.css`, small root palette, many later hard-coded colors and feature overrides. DM Sans body, Manrope headings, Lucide icons, existing reusable UI primitives. | Add semantic tokens in one place and migrate feature selectors in reviewed batches; changing root variables alone cannot complete this redesign. Avoid an appended override pile. |
| Theme | `color-scheme: dark` in root CSS and viewport metadata; no functioning light-theme selector/provider found. | Dark is the initial supported theme. Make semantic names reusable for a future light palette without adding a fake toggle or claiming light support exists. |
| Communities | `src/lib/communities/data.ts`, Directory, CommunityView, CommunityForms, ChannelManager, CommunityBanner/HeaderUpload and existing RPC/RLS controls. Public/discoverable/private membership, approved-host creation, ordering, private uploaded headers, archive/deletion safeguards. | Reuse real community records, stable UUIDs/slugs, admin order and authenticated banner routes. Discovery already searches names/descriptions and filters All/My communities, not a general category taxonomy. |
| Chat | ChannelWorkspaceLayout, CommunityChannelSidebar, ChatWorkspace, MessageTimeline, MessageItem, MessageComposer, ThreadPanel, WorkspaceMembers, ChatSearch/notification settings. Persistent PostgreSQL messages and authorized Supabase private Broadcast, virtualized history, stable IDs/revisions, safe Markdown/files. | Restyle and arrange existing components. Preserve compact rows, bounded history, bottom composer, independent thread pane/scroll, read/mention states and private topic cleanup. |
| Voice | `src/components/voice/VoiceProvider.tsx`, VoiceControls, `src/lib/voice/server.ts`, `app/api/voice/[operation]/route.ts` and independent enforcement worker. Official LiveKit client/React/Node packages. | Existing real room grants, access checks, participant/device/mute/deafen/reconnect controls and persistent status remain. No waveform implying live audio when disconnected. |
| Profiles/people | MemberContext, ProfileEditor/AccountSettings, member directory/contact actions, PeopleProvider/PeopleRail; `src/lib/profiles`, `src/lib/people`; `/profile`, `/members`, `/members/[id]`, `/messages`. | Restyle real avatars/names and privacy-permitted presence; retain friendship/block/DM actions and profile deep links. Do not manufacture public profile/activity panels. |
| Discovery/Home | `app/(members)/home/page.tsx` supplies accessible directory data to `src/screens/Home.tsx`; that file also exports Landing used by `app/page.tsx`. Directory lives in `src/components/communities/Directory.tsx`. | Both public landing and authenticated home need copy/art direction updates; changing Home.tsx can affect both. Home currently shows the first three ordered accessible communities, not a proven recommendation/trending algorithm. |
| Social | SocialFeed, `src/lib/social`, `/feed`, community posts and authenticated media APIs. Reactions/comments/follows/reports and audience RLS already exist. | Reuse posts/media and genuine community context; widen gaming-led copy without replacing content or introducing generated social activity. |
| Events/Faith | `src/components/spaces/Spaces.tsx`, `src/lib/spaces`, `/events`, `/faith`, details routes and `/notifications`; genuine RSVPs, timezone display, host controls, sensitive prayer visibility and preference-aware notifications. | Reuse event/date and space components; make activities and hangouts more visible while preserving private-to-moderators prayer and notification content restrictions. |
| Auth/permissions | Supabase Auth SSR in `src/lib/supabase`; `requireUser` in `src/lib/auth/session.ts`; server validation/actions, RLS/RPCs, separate platform/community roles and private storage. | A visual redesign is not an auth migration. Never infer access from a visible rail item or cached role. Preserve verification, recovery, 18+ eligibility, onboarding, deletion and server authorization. |
| Mobile | Main mobile nav/drawer; chat channel/member/search dialogs, context-specific collapsed shell, visualViewport sizing, safe-area/keyboard rules and reduced-motion selectors. Existing breakpoints include 760px and chat 1050px, plus feature-specific thresholds. | Retain working viewport/focus/scroll behavior; reconcile breakpoints gradually rather than stacking new fixed bars. Desktop reference cannot simply be scaled down. |
| QA/deployment | Vitest, real loopback Supabase/Realtime/LiveKit suites, Playwright desktop/mobile, axe; Vercel/Next, Supabase migrations, private worker, PWA manifest/service worker. | `CHAT_OVERHAUL_COMPLETION.md` is the prior QA baseline. It records 326 unit and 102+2 browser successes from Stage 9; those tests were not rerun or re-certified during this documentation audit. |

### Current tokens and important gaps

Current root tokens: `--bg: #0b0e18`, `--panel: #121623`, `--panel-hover: #191d30`, `--border: #24283b`, `--muted: #949bb2`, `--purple: #9c87ff`, `--cyan: #72dbde`, `--sidebar-width: 232px`, `--radius: 14px`. Foreground, inputs and many chat/voice/admin/media states still use literal colors. Changing only `--purple` would miss many surfaces and could break contrast.

There is no dedicated joined-community icon rail today: the collapsed global sidebar contains navigation icons, not community identities. Channel mode already combines global navigation, its own channel panel and a member panel. Adding another full sidebar without reconciling those regions would starve the message workspace.

**Product constraints beyond styling:**

1. Onboarding currently requires at least one game, platform and interest (`src/lib/profiles/actions.ts`, ProfileEditor). General-interest members cannot complete the intended non-gaming journey by merely changing the welcome headline. Revisit optional gaming selection in a separately approved product/validation change; preserve existing selections and account security.
2. Community records expose cover/header data but no general category or dedicated icon field in the current Community DTO. Education, Science & Tech, Entertainment, etc. in the reference are visual examples, not existing product records or supported filters. A typed taxonomy/icon upload feature would need a separately reviewed additive model/API/RLS change. Phase 1 needs none.
3. Profile interest choices are an existing enum with gaming/faith/social items, not an arbitrary extensible interest directory. Broadening them must align UI, validation, database checks and notification/feed filters; do not silently relabel stored values or reset preferences.

## 3. Attached reference: interpretation

The reference presents a rounded desktop application window against a lavender background. Within it are four functional zones:

1. **Narrow vertical icon rail:** repeated circular community identities with a strongly lit active item and add/explore affordances. Translate into an authorized joined-community rail with named tooltips, visible focus and current-state markers. Initials or existing permitted artwork are sufficient until an actual community icon field exists. An add button must respect approved-host creation.
2. **Purple secondary navigation:** a broader purple panel groups Home/Events and interest destinations. Translate into a single context-navigation slot: global sections on Home/Discover, existing channel/category list inside a community. Provide a clear way back to global navigation; do not remove any working destination.
3. **Large central workspace:** top search/actions, a wide gradient welcome banner, two-up featured cards, smaller interest cards and more content beneath. Translate into real accessible communities/events/posts, with protected headers where available. Keep the chat variant full-height and compact; it should not inherit the discovery page's giant hero or double card padding.
4. **Right profile/member/activity panel:** self identity above compact members and recent activity. Reuse self profile, PeopleRail and WorkspaceMembers. The channel member panel remains contextual; do not display both global and channel member rails. Existing simple avatar/name rows and click-through friend flow remain intact. Show activity/new-member timestamps only if an authorized source actually supplies them.

Other visual principles:

- Main surfaces use layered blue-violet darkness, with a distinctly purple navigation plane. Depth comes from luminance, fine borders and restrained shadows, not a black background everywhere.
- Cyan/purple/magenta gradients concentrate in the hero, selected-ring details and occasional card art. Text-heavy chat, forms and moderation evidence stay quiet and readable.
- Rounded rectangular cards use deliberate gutters and a consistent edge treatment. Profile portraits are focal elements, but the reference's hexagonal portrait/frame is not a requirement to crop or replace members' avatars.
- Large headings and a calm sans-serif rhythm; retain current DM Sans/Manrope initially. Avoid another font download or an unreviewed proprietary typeface.
- Use the existing Lucide family at consistent size/stroke. Preserve The Gathering's identity; do not trace the reference's logo or copy its avatars, photographs, illustrations, card images or fictional account names.
- Do not copy the fake desktop traffic lights or a waveform as interactive browser chrome/audio feedback. Genuine connected/speaking states come only from LiveKit.
- No reference asset is imported into the repository. Later artwork should use existing authorized uploads, owned assets or newly commissioned/licensed abstract work. Pure CSS gradients can establish the foundation without any asset dependency.

## 4. Proposed design system

### Palette and semantic CSS contract

The six supplied colors remain unchanged as primitives. They are not all suitable for body text or every button pairing. This **documentation-only** block is the proposed starting contract for a later implementation; do not paste it into production globally without the staged contrast/state review.

```css
:root {
  /* Brand primitives: exact requested values. */
  --palette-main: #171B32;
  --palette-secondary: #292D4D;
  --palette-sidebar: #5E518B;
  --palette-brand: #9266DB;
  --palette-cyan: #37CEDC;
  --palette-magenta: #D854D6;

  /* Background and surface hierarchy. */
  --background-canvas: var(--palette-main);
  --background-shell: #1C203B;
  --surface-base: var(--palette-secondary);
  --surface-raised: #343957;
  --surface-overlay: #222641;
  --surface-navigation: var(--palette-sidebar);
  --surface-rail: #24213F;
  --surface-chat: var(--palette-main);
  --surface-input: #20243F;
  --surface-hover: #363B60;
  --surface-navigation-hover: #504475;
  --surface-selected: #463763;
  --surface-disabled: #30344D;
  --scrim: rgb(9 12 28 / 72%);

  /* Text. Use secondary/muted for readable supporting copy, not low opacity. */
  --foreground-primary: #F4F2FC;
  --foreground-secondary: #D1D3E4;
  --foreground-muted: #BABDD2;
  --foreground-subtle: #979DBB;
  --foreground-on-accent: #0D1021;
  --foreground-on-navigation: var(--foreground-primary);
  --foreground-on-disabled: var(--foreground-muted);
  --foreground-link: #CFB6FA;
  --foreground-link-hover: #E4D5FF;

  --border-subtle: #3F4568; /* Decorative dividers only. */
  --border-control: #74799E;
  --border-selected: var(--palette-cyan);
  --focus-ring: var(--palette-cyan);
  --focus-offset-color: var(--background-canvas);
  --action-primary: var(--palette-brand);
  --action-primary-hover: #A47BE6;
  --action-primary-pressed: #9A70DE;
  --action-secondary: var(--surface-raised);
  --action-secondary-hover: #42486E;
  --accent-cyan: var(--palette-cyan);
  --accent-magenta: var(--palette-magenta);

  --status-success: #6EDBA6;
  --status-error: #FF9AA8;
  --status-warning: #F0C878;
  --status-info: #83DCEC;
  --status-offline: var(--foreground-subtle);
  --status-hidden: var(--foreground-muted);
  --surface-success: #173B32;
  --surface-error: #442535;
  --surface-warning: #3E3426;
  --surface-info: #183744;
  --foreground-on-status: var(--foreground-primary);

  --gradient-hero: linear-gradient(115deg,
    var(--palette-brand), var(--palette-magenta) 52%, var(--palette-cyan));
  --gradient-hero-scrim: linear-gradient(90deg,
    rgb(13 16 33 / 86%), rgb(13 16 33 / 72%));
  --gradient-navigation: linear-gradient(180deg,
    var(--palette-sidebar), var(--surface-rail));
  --gradient-selection: linear-gradient(135deg,
    var(--palette-cyan), var(--palette-brand));
  --shadow-card: 0 8px 24px rgb(9 12 28 / 24%);
  --shadow-overlay: 0 20px 56px rgb(9 12 28 / 48%);
  --shadow-accent: 0 0 20px rgb(55 206 220 / 16%);

  /* A 4px scale with compact conversation spacing. */
  --space-0: 0;
  --space-1: .25rem;
  --space-2: .5rem;
  --space-3: .75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --font-body: "DM Sans", sans-serif;
  --font-heading: "Manrope", sans-serif;
  --text-xs: .75rem;
  --text-sm: .875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-display: clamp(1.75rem, 3vw, 2.75rem);
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-display: 800;
  --leading-body: 1.5;
  --leading-compact: 1.4;
  --leading-heading: 1.15;
  --tracking-heading: -.025em;
  --radius-control: .625rem;
  --radius-panel: 1rem;
  --radius-card: 1.25rem;
  --radius-shell: 1.75rem;
  --radius-pill: 999px;
  --stroke-width: 1.75;
  --icon-small: 1rem;
  --icon-default: 1.25rem;
  --icon-large: 1.5rem;
  --avatar-small: 2rem;
  --avatar-default: 2.5rem;
  --avatar-profile: 5rem;
  --control-min: 2.75rem;
  --focus-width: 3px;
  --focus-offset: 3px;
  --rail-width: 4.5rem;
  --context-width: 15rem;
  --members-width: 16rem;
  --topbar-height: 4rem;
  --content-max: 90rem;
  --motion-fast: 120ms;
  --motion-normal: 180ms;
  --motion-easing: cubic-bezier(.2, .8, .2, 1);
  --layer-base: 0;
  --layer-sticky: 10;
  --layer-navigation: 20;
  --layer-dialog: 40;
  --layer-toast: 50;
}
```

Use a real font weight available in `app/layout.tsx`: Manrope can use 800; DM Sans should use its loaded 400/500/600/700 rather than synthesizing display weight. Keep chat text at least 14px with user zoom support; headings/card copy must not force the spacious discovery layout onto dense conversation rows.

Status colors are foreground/icon colors on their corresponding tinted surfaces; solid status-color buttons need the dark `--foreground-on-accent`. Danger actions also require words/confirmation, not red alone. Disabled controls keep readable labels plus their disabled state; do not multiply text opacity until it disappears.

### Measured starting contrast, and usage limits

Computed with WCAG relative luminance for the opaque proposed sRGB values during this audit:

| Pair | Contrast |
| --- | ---: |
| Primary text / main background | 15.29:1 |
| Primary text / secondary surface | 12.02:1 |
| Muted text / secondary surface | 7.16:1 |
| Subtle text / secondary surface | 4.98:1 |
| Primary text / sidebar purple | 6.26:1 |
| Dark accent text / brand purple | 4.62:1 |
| Primary light text / brand purple | **3.68:1 — unsuitable for normal-sized button text** |
| Control border / secondary surface | 3.15:1 |
| Cyan / secondary surface | 6.99:1 |

Use dark text for solid brand-purple/cyan/magenta actions, or choose an independently tested darker action background. Do not assume white on purple passes. Muted/subtle tokens above are intended for the dark content surfaces, not automatically the lighter purple sidebar: use on-navigation text there. Check every hover/pressed/status/input combination, gradient stop and uploaded-image background during implementation. The hero needs its dark scrim or a solid text plate; a gradient cannot guarantee readable text by itself. Focus should have an offset separating it from similarly colored controls. Target 4.5:1 normal text, 3:1 large text and meaningful non-text boundaries; retain a visible 3px focus ring and non-color selected/unread/status cues.

### Adoption and theme compatibility

In the later token milestone, introduce a centralized `src/styles/tokens.css` (proposed new file) imported before feature styles, and temporarily alias existing names: `--bg → --background-canvas`, `--panel → --surface-base`, `--panel-hover → --surface-hover`, `--border → --border-subtle`, `--muted → --foreground-muted`, `--purple → --action-primary`, `--cyan → --accent-cyan`, `--radius → --radius-panel`. Keep the current `--sidebar-width` contract until the shell milestone changes column widths atomically; community rail and context panel are distinct widths, not a blind replacement.

The `--purple` alias must not silently recolor light links to an inaccessible brand fill: migrate text usages to `--foreground-link` at the same time. Controls use `--border-control`, not decorative `--border-subtle`. Replace feature literals as each section is reviewed; dynamic authenticated image URLs are data, not color literals to remove. Migrate existing inline status colors to semantic classes when encountered, without changing their state source.

No existing light theme was found. Preserve dark `color-scheme` initially. A later light theme should override the same semantic contract under one real theme selector, after a complete palette/contrast and hydration/persistence design. Do not invert colors or advertise a working light switch in this phase. Preserve `prefers-reduced-motion` and distinguish focus/selected/error states in forced-color/high-contrast modes.

## 5. Component reuse and proposed shell

Conceptual desktop composition, not a new router/provider tree:

```text
Existing persistent authenticated providers (unchanged)
└─ AppShell
   ├─ CommunityRail                         proposed presentation component
   ├─ ContextNavigation slot
   │  ├─ existing global Sidebar content    home/discovery/events/feed/etc.
   │  └─ CommunityChannelSidebar            selected community/channel context
   ├─ Workspace region
   │  ├─ existing Topbar / channel header
   │  └─ existing page or ChatWorkspace + ThreadPanel
   └─ ContextPanel slot
      ├─ PeopleRail / authorized self profile on general pages
      └─ WorkspaceMembers OR active ThreadPanel on channel pages
```

The selected community context still uses the existing validated switch/last-channel logic from `src/lib/chat/workspace.ts`; no full page reload, invented room name or client-provided role. A collapsed rail may cache its visual selection locally, but server-authorized membership controls its contents. Outside chat, derive the rail from active memberships joined to accessible communities; do not reuse a service-role directory projection. If a shared membership projection is genuinely missing, implement a separately reviewed authenticated read without widening private-community visibility.

Reuse Brand, PageHeading, SectionHeading, ProfileAvatar/MemberAvatar, OnlineStatus, EmptyState, real notifications and VoiceConnectionBar from existing components. Extract a shared CommunityCard from Home/Directory only when preserving authenticated banners, current order, destinations and empty states; do not revive obsolete demo cards. Centralize presentation variants instead of copying JSX/data-fetching into a new dashboard.

Reuse real CommunityBanner on community/text/voice pages. Keep message IDs, DOM targets, memoization, virtualizer keys/measurements, composers and subscription ownership stable. The right-side thread and members must arbitrate space; allow a thread to take the context slot without remounting the main conversation. Keep global navigation reachable from the community rail/context header and mobile More menu, including Faith & Life, Members, Squad Up, reports/appeals, settings and role-appropriate administration.

## 6. Page changes and modification inventory

These are **future implementation targets**, not files changed by this audit.

| Files / area | Planned change | Preserve |
| --- | --- | --- |
| `src/styles.css`; proposed `src/styles/tokens.css` | Semantic tokens, staged literal cleanup, shell/card/form/overlay variants; later split feature sections only with cascade review | Feature specificity, reduced motion, keyboard viewport, safe areas, existing visibility/scroll rules |
| `src/components/AppShell.tsx`, `src/data.ts`; proposed `src/components/navigation/CommunityRail.tsx` | Rail + one secondary context slot; coherent global sections, broaden CONNECT & PLAY copy; responsive slots | Every working route, active states, focus/skip/drawer behavior, logout and voice status |
| `src/components/ui.tsx`, `src/components/MemberContext.tsx` | Approved brand lockup/tagline, semantic buttons/panels/avatars/status; no copying reference logo | Existing real member identity and accessible labels |
| `src/screens/Home.tsx`, `app/page.tsx`, `app/(members)/home/page.tsx` | Replace gaming-only hero emphasis with exact new tagline; shared-interest welcome, existing communities/events/announcements/voice actions | Real ordered community cards and uploaded headers, install link, empty/error states |
| `src/components/communities/Directory.tsx`, CommunityView, CommunityBanner, CommunityForms, ChannelManager | Premium discovery/card/detail/settings treatment; use existing All/My and search until taxonomy is genuinely supported | Visibility/membership/RLS, invite/approval, ordering, private banners and lifecycle confirmations |
| `src/components/chat/ChannelWorkspaceLayout.tsx`, CommunityChannelSidebar, ChatWorkspace, MessageTimeline, MessageItem, MessageComposer, ThreadPanel, ChatSearch, WorkspaceMembers | Apply semantic chrome/layout and compact typography; contextual member/thread region | Realtime, retries, private access, receipts, notification settings, attachment permissions, pagination/anchors and stable keys |
| `src/components/voice/VoiceControls.tsx`, existing `/voice` UI in `app/(members)/voice/page.tsx` | Lounge cards, device/connection/status styling using existing functionality | VoiceProvider lifetime, API/SDK/worker, actual mute/deafen/quality/reconnect/permission behavior |
| `src/components/people/PeopleRail.tsx`, MemberDirectory, MemberContactActions, People; `app/(members)/members/[id]/page.tsx`, `/profile` | Compact avatar/name lists, permitted self/profile panel, profile spacing and contact actions | Simple friend/member rows, online/offline/hidden privacy, blocks, DM consent, private profile access |
| `src/components/auth/ProfileEditor.tsx`, AccountSettings, existing auth pages | Shared field/focus/error tokens and broader copy; separately specify optional gaming onboarding later | Email verification/recovery, passwords, 18+, privacy choices and secure deletion; no auth replacement |
| `src/lib/profiles/actions.ts`, `src/lib/auth/validation.ts`, profile RPC/constraints | **Only if later product scope approves:** align general-interest onboarding/taxonomy validation | Existing game/platform selections and stable stored interest values; coordinated server/database validation |
| `src/components/social/SocialFeed.tsx`, `app/(members)/feed/page.tsx` | General community story framing, premium post/media cards and existing filters | Actual posts, audience/blocks/media/report permissions, cursor paging |
| `src/components/spaces/Spaces.tsx`, existing event/faith/detail routes | Cohesive event/hangout/prayer cards and timezone-aware date hierarchy | Host/RSVP/status controls, existing event dates, sensitive prayer privacy and opt-outs |
| `src/components/admin/AdminDashboard.tsx`, MemberSafety and moderation forms | Semantic form/status/readability parity, minimal decorative treatment around evidence | Scope/roles, live metrics, audits, bans, appeals and confirmations |
| `app/layout.tsx`, `app/manifest.ts`, install page, `scripts/build-pwa.mjs`, owned public PWA assets | Align metadata/description/theme color/approved branding after design implementation; update owned screenshots/icons only as necessary | PWA identity, scope/start URL, updates/offline privacy; never cache authenticated pages/files |
| Relevant unit and `e2e/*.spec.ts` tests | Adapt layout selectors only where required, add rail focus/overflow/contrast checks; rerun preservation cases | Real-service assertions, permissions, existing two-account chat and actual voice tests |

Confirm file ownership before extraction; `src/screens/Home.tsx` contains both Home and Landing, and `src/components/spaces/Spaces.tsx` contains multiple space/event components. Do not assume filename equals a single isolated page. Backend `src/lib/chat`, `src/lib/voice`, Supabase clients, API contracts and existing published migrations are preservation references, not default redesign edit targets.

## 7. Desktop and mobile adaptation

- **Wide desktop (~1400px+):** 72px rail + 240px context navigation + flexible workspace + optional 256px context panel. Use `minmax(0, 1fr)` and test expanded navigation/thread states; do not reserve an additional global full-width sidebar inside chat. Rounded shell can have 12–24px outer breathing room, but should not waste the reference image's large decorative margin on real content.
- **Compact desktop/tablet (~1051–1399px):** hide/collapse the optional right panel first; keep the conversation comfortable. Tighten navigation only if minimum content width remains usable. A thread can replace the member panel, not squeeze in another fixed column. Preserve existing 1050px chat drawer behavior until explicitly reconciled and tested.
- **Tablet (~761–1050px):** central content leads; existing channel/member dialogs replace permanent panels. Global rail/context can be a drawer or compact chooser. Maintain one coherent navigation model and focus return.
- **Mobile (<=760px):** no simultaneous desktop columns. Keep bottom navigation and More access; community selection is reachable through the navigation/channel drawer. Do not silently replace Squad Up or another working bottom destination with a nonfunctional generic Activities route. Channel/member panels use separate existing dialogs; threads use a dedicated view with a clear return.
- Preserve `visualViewport`, `100dvh`/fallback, `min-height: 0`, safe-area insets and existing editing-state handling. Composer and genuine voice status must not stack under the bottom bar/keyboard. Keep body scrolling for discovery and independent message/thread scrolling for chat.
- Cards become one column on narrow screens; wrap long names, descriptions and counts, not sideways body scrolling. Test 320/390/760/1050/1280/1440 widths, landscape, zoom, reduced motion and physical mobile keyboards. Icons need accessible names and 44px targets; tooltip-only access is insufficient on touch.
- Animate color/opacity and small decorative transforms for 120–180ms; no layout-height animation in virtualized messages and no perpetual waveform/glow. Reduced motion suppresses nonessential transitions.

These thresholds are proposed layout budgets, not new CSS breakpoints already installed. Integrate them against current feature media queries and screenshots rather than replacing them wholesale.

## 8. Preservation requirements and migration risks

**Hard invariants:** keep all communities/members/messages/channels/categories/roles/memberships/posts/events and UUID/deep links; existing authentication architecture, 18+ policy, profile privacy and later opt-outs; Supabase private subscriptions and committed delivery; secure upload/download and SSRF controls; platform/community role separation and audit/evidence; persistent LiveKit and healthy worker gates; real offline/error/loading states; PWA private-cache exclusions. Approved visual evolution does not authorize moderation changes or production data edits.

| Risk | Mitigation / gate |
| --- | --- |
| Global palette change hides buttons, unread/mention/error or status contrast | Token aliases plus per-feature state audit; measure composited gradients/opacity, not just palette chips. Keep text/icon cues and control borders. |
| Extra rail duplicates current global/channel sidebars | One context-navigation slot, optional right region, explicit width budget; preserve all route access in both global/community modes. |
| Shell extraction remounts voice/chat or loses drafts/scroll | Keep member-level providers and current channel IDs/keys; test real two-account voice while changing channels, thread position, retries and subscription teardown. |
| Typography/card spacing breaks virtualized measurements or composer height | Change chrome separately from message density; preserve ResizeObserver/virtualizer behavior and run the 5,000-message/reconnect/anchor cases. |
| “General interests” remains a gaming-only requirement disguised with new copy | Separate and review onboarding enum/RPC constraints and optional game/platform requirements before claiming a complete non-gaming journey. |
| Category links, popularity or new-member activity invented from the screenshot | Use authorized existing data; current filter/ordered communities first. New taxonomy/metrics need explicit product and backend specification, not demo values. |
| Reusing private community artwork in public hero/PWA/CDN | Keep authenticated endpoints and visibility gates. Use owned public abstract artwork for public pages and no protected content in worker caches. |
| CSS split changes cascade/public/auth/admin/mobile behavior | Stage aliases/components with small reviewed diffs; keep specificity/order and broad non-chat regression coverage. |
| New light-theme control or schema icons claimed prematurely | Dark only initially. No new toggle, icon upload or schema until implemented, secured and tested. |
| Release drift or asset/service-worker mismatch | Check deployed commit and pending migrations independently; rebuild public PWA assets only in the implementation milestone. No destructive migrations or live deployment without explicit authorization. |

**Migration assessment:** the visual foundation, tokens, shell and broader copy need no database migration. Do not add a migration merely to restyle a card. General taxonomy, community icon uploads, genuine trending/activity projections or onboarding requirements may require additive validation/schema work in a separately approved milestone. Preserve existing fields/IDs, introduce compatible reads, test RLS and obtain production approval before applying anything hosted. A broader platform identity is not permission to rename/delete existing game communities or migrate chat providers.

## 9. Development milestones and acceptance gates

1. **Phase 1 — this audit/specification:** review source and attached reference; record tokens, file inventory, product gaps and preservation constraints. Deliver only this plan. No runtime UI/token import changes.
2. **Token/component foundation:** after implementation authorization, add centralized tokens and compatibility aliases; apply to shared forms/buttons/panels/typography and validate all states. Keep existing routes/layout first, no database change.
3. **Persistent shell composition:** implement joined-community rail, one context panel and responsive optional member region; reuse switching/navigation and preserve VoiceProvider. Verify focus, drawers, keyboard/composer positioning and real audio while navigating.
4. **Home/Discover lounge:** exact brand/tagline, owned gradient hero, real ordered community cards/banners, events and hangout actions, genuine profile/member panel; broaden copy without inventing categories/popularity. Test blank/unavailable/private data states.
5. **Chat/voice visual parity:** apply the premium palette/chrome while retaining compact messages, attachments, moderation, search, threads and actual media controls. Run real two-account delivery/access loss/reconnect and long-history tests before proceeding.
6. **Profiles/social/events/Faith/admin/auth parity:** use shared semantic styles, retain working features/privacy and review public/PWA metadata. Handle the non-gaming onboarding/taxonomy gap only through its separately approved validation/product scope.
7. **Release QA:** fresh lint/typecheck/unit/build/bundle/security and affected database/Realtime/voice + full desktop/mobile browser checks. Review screenshots, measured contrast, keyboard/screen reader, real mobile keyboard/mic and hosted acceptance. Publish/deploy only with user authorization; report exactly which checks ran.

### Acceptance criteria for the future implemented foundation

- The brand is The Gathering with **Find Your People. Find Your Place.**; Home/Landing/Discover describe shared interests and hangouts, with Gaming and Faith & Life both still reachable.
- Tokens are centralized and shared; no scattered new hex colors in component code. All supported input, button, hover/pressed/disabled/selected, focus, notification and validation states are readable. Dark theme remains honest; light support is not claimed without implementation.
- The reference's rail/secondary panel/workspace/context panel hierarchy is recognizable on desktop without copying its assets. Phone layouts prioritize content with accessible drawers and safe controls.
- Every existing authorized navigation target works; selected community/last channel/unread/mentions remain correct; private/blocked/archived/deleted content never appears through a new rail, card, member/activity panel or search.
- New controls use real existing capabilities or are absent/clearly unavailable. No fabricated community categories, online counts, member avatars, activity feed, popularity or simulated voice state.
- Real two-account chat, message edit/delete/reactions/pins/threads/mentions/files and offline retry remain working; no duplicate messages, missed pagination or regressions in protected attachment access.
- Existing actual LiveKit connection persists through text/community/profile navigation; mute, device choice, reconnect and authorized removal still work, with worker health enforcement unchanged.
- Uploaded community headers remain visible in supported Home/Discover/community/text/voice contexts through authenticated routes. Existing private member choices and simple avatar/name friend/member lists are respected.
- Long-history virtualization, scroll anchors and bounded pages retain their measured baseline; layout introduces no persistent subscription growth or unnecessary second provider. Monitor layout shift with real media.
- No body overflow at tested widths/200% zoom; touch targets at least 44px; keyboard/visible focus/skip links/dialog return work; normal text meets 4.5:1 and required non-text indicators 3:1 in final rendered states.
- Existing authentication, recovery/onboarding/profile editing, deletion/ownership safeguards, communities/invites, social/Squad Up, prayer/event/notification privacy, moderation/admin, PWA/install/offline behavior continue passing their relevant real tests.
- Non-gaming onboarding is not labeled complete until current mandatory gaming validation has been intentionally resolved across client/server/database. No destructive migration, provider replacement or existing-record reset is part of acceptance.

## 10. Verification performed in this phase

Read-only repository/component/style/data-flow inspection and direct visual analysis of the attached reference were performed. A local, dependency-free relative-luminance calculation produced the contrast ratios above. File paths and existing selectors were checked against this checkout. Only this Markdown design plan is added.

No UI redesign, theme import, test fixtures, database operation, build/PWA regeneration, deployment or production data change was performed. Runtime tests were not rerun for a documentation-only design audit; Stage 9 results are explicitly historical baseline evidence in `CHAT_OVERHAUL_COMPLETION.md`. Future implementation must execute the acceptance checks afresh.

## Phase 2 implementation follow-through

The subsequent Phase 2 request explicitly authorizes the Premium Digital Lounge shell. Semantic tokens and scoped chrome are now imported, with a real joined-community rail, reused contextual channel navigation/member panes, responsive activity/navigation drawers, live notification/DM controls and persistent voice controls. Existing providers, routes, IDs and permissions remain. The requested real new-member panel necessitates one additive authenticated read function (`202611130001`), reusing existing visibility/block/card checks; no community/message/member records or tables are reset. See `docs/PREMIUM_LOUNGE_SHELL.md` and the development log for implementation, verification, migration/release approval and remaining device/hosted acceptance. The planning-only statements above describe Phase 1, not this later authorized implementation.

## Phase 3 implementation follow-through

The later authorized Home/Explore milestone reuses the Phase 2 shell, community/auth/chat/voice services and existing covers. Original abstract hero artwork, visual cards, real permission-filtered activity, documented ranking, interest discovery, newly created public spaces and joined/unread communities are implemented. Additive version `202611140001` provides optional host-assigned categories and authorized summary reads without reclassifying/resetting existing data. See `docs/PREMIUM_HOME_EXPLORE.md` and the development log for executed tests, bounded personalized popularity semantics, guarded installation and remaining hosted/device/load acceptance. No production SQL or release is included in this implementation.

## Phase 4 implementation follow-through

The authorized community/chat visual milestone reuses CommunityView, the existing contextual channel/member components and all chat/voice/auth providers. Large authorized covers, scoped overview activity/events/announcements/guidelines and semantic compact-chat styling are implemented without a new migration. Existing unread/thread/file/message/permission behavior remains. See `docs/PREMIUM_COMMUNITY_CHAT.md` and the development log for the exact executed verification, real audio through text-channel switching, bounded metadata reads, documented existing limitations and remaining device/hosted acceptance. Implementation does not authorize production SQL or release.

## Phase 5 implementation follow-through

The authorized Hangouts milestone evolves `/voice` with the existing LiveKit provider/admission/worker and current community permissions. Real room cards/activity, host-category-based types, permitted avatar previews, successful current-tab history, live suggestions and Gatherings accompany the styled participant grid and persistent controls. No general temporary-room creation or durable cross-device history is implied; their required backend extension and physical two-device acceptance are documented in `docs/PREMIUM_HANGOUTS.md`. See the development log for executed multi-account WebRTC results and remaining device/hosted/navigation-preference limitations. No new SQL or live release is included.

## Phase 6 implementation follow-through

The authorized profile/social-discovery milestone retains existing Auth, friendship/block/DM privacy and member-layout providers. Premium profile/mini-profile presentation, broader selectable interests, optional gaming onboarding, explicit full-interest sharing and authenticated public/mutual-community projections are implemented. Additive `202611160001` preserves historical values and default privacy choices; no production SQL or release is included. See `docs/PREMIUM_PROFILES.md` and the development log for installation, ranking, executed checks, rollback constraints and remaining hosted/device/scale acceptance.

## Phase 8 QA follow-through

The authorized final review preserves the existing app, all data/providers and server permissions. It diagnoses/fixes text-only navigation calls from voice rooms, reduces persistent-shell identity reads, protects hero text over gradients and corrects the flat People heading layout. `PREMIUM_REDESIGN_COMPLETION.md` records local functional/security/build coverage, screenshot evidence at desktop/tablet/mobile widths, actual network/error tests, query measurements, incomplete features and manual hosted/device acceptance. No production data change or live deployment is part of QA.
