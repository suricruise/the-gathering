# Development log

## 2026-10-22 — Phase 3: authentication and gamer profiles

### Delivered

- Migrated the application runtime from Vite/React Router to Next.js 16 App Router, retaining the responsive Phase 2 community screens. Vite remains only for Vitest transformation. Preserved the framework-generated `AGENTS.md` and consulted its bundled current authentication, server-action, data-security, proxy, and cookies guides.
- Integrated `@supabase/ssr` with per-request clients, async cookie handling, verified-claims refresh in `proxy.ts`, and independent `getUser()` authorization in protected layouts, pages, and mutations. Auth cookies are persistent, HttpOnly, SameSite=Lax, and Secure in production; authenticated responses are private/no-store.
- Added real email signup/verification, login/logout, PKCE and token-hash callbacks, password recovery, current-password-verified account password changes, and protected routes. Missing configuration fails closed instead of simulating authentication.
- Added polished three-step onboarding for identity/privacy, games/platforms, and private interests. The dashboard/sidebar use the real member identity and avatar. Profile editing is server-persisted, with transactional favorite/interests updates and a visible-profile link.
- Enforced 18+ age self-attestation at both server validation and `auth.users` insertion. Stored immutable age evidence privately; mutable user metadata and client-supplied roles/IDs are never authorization sources.
- Added four versioned migrations for profiles, private preferences/interests, games, platforms, favorite relations, private age evidence/abuse budgets, private avatar storage, minimal opt-in profile/media projections, and active-viewer validation. All user tables enable RLS. Direct user-data mutations are revoked in favor of scoped session-derived RPCs.
- Protected handle selection with normalization, a unique constraint, authenticated claim budgets that persist after collisions, and generic failures. No public username directory or availability API was introduced.
- Added server-only avatar upload: verified caller, actual image decoding, size/pixel/type limits, metadata stripping, 512px WebP re-encoding, random owner-scoped keys, and per-request visibility-authorized no-store streaming. No anonymous/authenticated arbitrary storage writes or permanent public media URLs.
- Added account preferences and deletion with explicit confirmation, password reauthentication, own-prefix Storage cleanup, Admin deletion of only the verified identity, related-row cascades, and rate-record cleanup. Members-only lookups reject stale JWTs from deleted/unverified/ineligible/banned viewers.
- Documented hosted setup, redirects, SMTP/templates, secure variables, migrations, local services, launch limitations, and deployment in `docs/SUPABASE.md`, README, architecture, and screen inventory. Next.js now requires a server runtime; the old static Vite `dist/` is obsolete.

### Validation completed

- Lint: passed with no warnings.
- Typecheck: passed, including routes, application, server actions, tests, and browser configuration.
- Vitest: **64 tests passed**, none failed or skipped. Includes server input/age validation, authorization failures, submitted-ID/role isolation, unsafe avatar rejection, deletion reauthentication/cleanup failures, and UI/onboarding behavior.
- PostgreSQL access-control suite: **21 tests passed** in a rolled-back transaction against the real local Auth/Storage schema. Includes RLS, owner isolation, restricted data, direct-write denial, age bypass rejection, atomic updates, unique-claim budgets, avatar ownership, stale viewer rejection, deletion cascades, and avatar protection even in the presence of an unrelated broad permissive storage policy.
- Real Supabase API integration: **13 tests passed**, none failed or skipped. Includes unverified login denial, direct Auth age gate, separate sessions, refresh, REST isolation, private/public projections, Storage upload denial, and deleted-user JWT denial.
- Playwright: **46 tests passed**, none failed or skipped, across desktop and mobile. Includes actual local verification/recovery emails, onboarding, cookie persistence, profile/avatar edits and visibility, logout, password changes, saved settings, deletion with a wrong-password attempt, protected routes, keyboard navigation, overflow checks, and 32 automated axe WCAG A/AA scans.
- Additional onboarding review: six axe scans (all three steps at desktop and phone sizes) reported zero violations and no horizontal overflow; desktop login and mobile onboarding screenshots were visually inspected. Automated scans supplement manual accessibility review and do not establish complete certification.
- Production Next.js build: passed. Client-bundle scan confirmed the configured server secret is absent from client build artifacts.
- Production browser smoke: passed real login, protected routing, persisted profile edit/reload, Secure/HttpOnly/SameSite cookies, private caching, logout, and denied post-logout access, with no browser errors.
- The standard Supabase CLI database image hit the Docker runtime’s unpacking-space limit. A smaller isolated stack using official Supabase Auth/REST/Storage images with official PostgreSQL 17 was successfully started; all four app migrations were applied and repeat startup/checksum validation passed. No package, checksum, or TLS verification was bypassed.
- Browser testing caught and fixed a premature onboarding submission caused by reusing a changing step button, along with stable accessible names for selected game/platform cards and precise test assertions for independent form notices. No assertions or required checks were disabled to make the final suite pass.

### Reusable configuration and hosted status

Saved updated Next.js install/start instructions and declared `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL`, and a server-only `SUPABASE_SECRET_KEY` requirement. The declared secret destination adds `klkwwieabhtayfxfdqec.supabase.co` to the saved restricted-network requirements. Draft saving is confirmed; it does not apply hosted SQL, supply secret values, or publish the environment.

The hosted project has **not** been migrated or live-validated by this task. Rotate the server secret posted in chat, add replacement credentials securely in environment settings, configure the canonical app URL/SMTP/email redirects, and apply the ordered migrations through an authorized database/CLI/SQL-editor connection. No hosted secret from chat was copied into source, logs, setup scripts, or saved configuration values. Local tests used locally generated development credentials only.

Age enforcement here is self-attestation, not independent age verification. Community chat, voice, feed, events, squads, and operational admin services remain explicitly labeled development content and disconnected.

## 2026-10-22 — Phase 2: responsive interface foundation

### Starting context

The selected repository `suricruise/the-gathering` was empty, with an unborn local branch and no remote refs. The requested `AGENTS.md`, `PROJECT_BLUEPRINT.md`, `ROADMAP.md`, and prior `DEVELOPMENT_LOG.md` were not present. Phase 2 was implemented from the user’s explicit screen, design, accessibility, and validation requirements. No application source or prior user work was overwritten.

### Delivered

- React 19 / TypeScript / Vite app with working direct routes and all 13 requested primary screens.
- Premium navy, indigo/purple, and cyan design system with original CSS landscape art, local fonts, rounded surfaces, and subtle motion.
- Desktop collapsible navigation, community/channel navigation, optional online-friends rail, and persistent disconnected voice state.
- Mobile bottom navigation, complete navigation drawer, channel drawer, responsive conversations, safe-area spacing, and persistent voice status strip.
- All requested reusable components plus explicit loading, empty, unavailable, not-found, and recoverable rendering-error states.
- Locally working community/squad/feed/event filters, sample reactions/bookmarks, demo profile editing, and browser-only settings persistence with failure feedback.
- Explicit demo content and service boundaries. Sending chat/DMs, joining voice, authentication, memberships, squad requests, publishing, registration, and admin actions remain unavailable. No successful chat or voice connection is simulated.
- Keyboard focus styles, skip link, route focus, drawer focus trapping/restoration, Escape dismissal, semantic labels, text status equivalents, and reduced-motion support.
- Screen and architecture documentation in `docs/` and reproducible developer commands in `README.md`.

### Validation

Final checks completed successfully:

- Frozen dependency reinstall: `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` passed.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed, including application, tests, and browser-test configuration.
- `npm test`: 33 tests passed; none failed or skipped.
- `npm run build`: production build passed.
- `npm run test:e2e`: 30 real Chromium tests passed; none failed or skipped. Includes 26 automated axe WCAG A/AA scans (13 screens at 1440px desktop and 390px mobile), horizontal-overflow checks, real navigation, disabled-service checks, keyboard skip navigation, and notification controls.
- Additional layout inspection covered 13 routes at 320px, 768px, 1024px, and 1920px. Two decorative welcome-orbit overflows were diagnosed and fixed; targeted 320px and 768px rechecks passed.
- Production browser smoke passed against the built app: welcome → home → filtered discovery → community details; direct channel URL with disabled sending; browser settings saved and restored after reload. No browser exceptions or failed asset responses occurred.
- Desktop welcome/dashboard and phone dashboard screenshots were visually inspected.

The first checks caught and resolved a TypeScript test option, focus-cleanup warning, avatar ARIA semantics, secondary-text contrast, and a browser-test timing issue. No checks were disabled to make the final suite pass. Automated accessibility checks supplement manual review; they are not a complete accessibility certification.

Browser checks use the cloud machine’s installed Chromium; the Playwright browser download was blocked by network policy, so no browser download or expanded network access is required here.

### Reusable cloud environment

Saved and verified an `install_script` for frozen installation, typechecking, and production build, and replaced the earlier empty-repository `start_skill` with current development-server and validation instructions. These are saved drafts for environment settings review; they have not been published by this task.

### Remaining service work

Connect real authentication and authorization, user/community data, messages, voice signaling, event registration, notifications, and moderation through backend services in a subsequent phase. The admin route is explicitly a public development shell and does not confer privileges. Production hosting needs an SPA route fallback.
