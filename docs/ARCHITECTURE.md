# Application architecture

## Current runtime

Next.js 16 App Router and React 19 replace the Phase 2 Vite application runtime. Vite remains only as Vitest’s unit-test transformer. Next’s `proxy.ts` refreshes Supabase cookies using `@supabase/ssr` and verified claims; protected layouts/pages and every mutation independently authorize with `auth.getUser()`. Authentication is not delegated to a client router or a proxy-only gate.

The original Phase 2 repository began empty, without a blueprint or roadmap. The Phase 3 implementation follows the explicit authentication/profile request. `next dev` generated the framework’s `AGENTS.md`; it is preserved, and the bundled current Next.js guides were consulted.

## Source map

- `app/layout.tsx`: local fonts, global styles, metadata, and HTML root.
- `app/page.tsx`: public welcome.
- `app/login`, `register`, `forgot-password`, `reset-password`: real account forms with server actions.
- `app/auth/confirm/route.ts`: one-use verification/recovery token hashes.
- `app/auth/callback/route.ts`: PKCE code exchange and allowlisted internal redirects.
- `app/onboarding`: verified-user, three-step identity/games/interests setup.
- `app/(members)/layout.tsx`: verified identity, own profile loading, and responsive shell.
- `app/(members)/[...path]/page.tsx`: onboarding completion gate and retained community screens.
- `app/(members)/profile` and `settings`: real profile and account workflows; no demo persistence.
- `app/people/[username]`: opt-in, minimal profile projection. No public user directory.
- `app/api/avatars/[id]`: per-request visibility-authorized media streaming; no public bucket URLs.
- `src/lib/auth`: server guards, Zod validation, state types, auth actions, HMAC abuse budgeting.
- `src/lib/supabase`: per-request SSR clients, server-only admin client, and cookie-refresh integration.
- `src/lib/profiles`: own-profile data transfer objects and validated profile/avatar/preferences/deletion actions.
- `src/components/auth`: polished auth, onboarding/profile, and account settings forms.
- `src/components/MemberContext.tsx`: minimal safe identity DTO for shell personalization.
- `src/screens`: retained Phase 2 community presentation.
- `src/compat/navigation.tsx`: small presentational compatibility layer mapping Phase 2 `to` links to Next Link and route hooks. It performs no authorization.
- `supabase/migrations`: ordered, immutable SQL migrations; RLS, grants, scoped RPCs, age evidence, private storage, and active-viewer checks.
- `supabase/templates`, `supabase/config.toml`: documented email/local settings.
- `scripts/`: local-only service setup, migration checksums, real database/API tests, and client-artifact secret checks.
- `e2e/`: real local-account browser tests at desktop and phone sizes.

## Trust boundaries

Client form data, hidden fields, roles, IDs, filenames, MIME claims, and redirect destinations are untrusted. Actions derive identity from a verified current session, validate user-editable values, and return only narrow notices/errors. The admin client never enters client code. Ordinary data reads and profile mutations use authenticated RLS clients; database routines have fixed search paths, explicit grants, and session-derived ownership.

User preferences and interests stay owner-private regardless of profile visibility. Public/member profile projections expose only fields listed in `docs/SUPABASE.md`. Media obeys the same policy. Members-only access also checks the live viewer record to reject stale JWTs belonging to deleted, unverified, ineligible, or banned identities.

Profile saves update profile, interests, favorite games, and platforms atomically. Auth identity deletion cascades related tables, with storage cleanup performed through the Storage API first. Storage/API failures are real errors, never success simulations.

## Retained service boundaries

The community dashboard, chat/voice, demo online friends, feeds, squads, events, and admin shell remain development fixtures. Authentication does not make those services live. Chat/voice controls remain unavailable, and the application never claims to send messages or establish a voice connection. No client-editable admin role was added; the admin shell grants no operational permissions.

## Deployment

Build with `npm run build`, run with `npm run preview`/`next start`, and supply secure configuration before public launch. Server actions require a Next runtime. Authenticated content, RSC payloads, callbacks, and avatars must never be cached publicly. Publishing the cloud filesystem/configuration does not apply hosted SQL migrations or configure Supabase SMTP and redirect policies. See `docs/SUPABASE.md` for the exact external requirements.
