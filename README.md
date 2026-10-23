# The Gathering

A premium dark gaming community interface with real Supabase email authentication and gamer profiles. Phase 3 uses Next.js 16 App Router, React 19, TypeScript, and the current `@supabase/ssr` integration. The Phase 2 responsive community screens remain intact behind authenticated routes. Chat, voice, feeds, squads, events, and administrative services still use explicitly labeled preview content and do not simulate successful connections.

## Develop

Use Node.js 22.12+ (validated with 24.19) and npm 10+.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

Configure Supabase through secure environment settings or ignored `.env.local`; see [.env.example](.env.example) and the complete [Supabase guide](docs/SUPABASE.md). Without configuration, public welcome/auth screens render and protected routes fail closed; authentication never pretends to succeed.

For the tested local integration stack:

```sh
npm run db:test-stack
npm run test:gateway
# In another terminal:
npm run dev
```

The smaller stack runs real Supabase Auth, REST, and Storage against PostgreSQL 17. Standard Supabase CLI setup is also documented in the guide. Local helpers generate only local development credentials and never copy credentials supplied in chat. Do not expose the test stack publicly.

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:integration
npm run test:e2e
npm run build
npm run test:bundle
```

Real integration tests require the local services and gateway. Browser tests use installed `/usr/bin/chromium`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or a Playwright-installed Chromium. They run desktop/mobile flows and automated axe WCAG A/AA checks. `test:bundle` confirms the configured server secret is absent from client build artifacts.

Run `npm run preview` after a production build. Hosting now requires a **Next.js server/runtime**, not the previous Vite static `dist/` or SPA fallback. `APP_URL` must match the deployed HTTPS origin. Next’s bundled agent guidance is preserved in `AGENTS.md`.

## Account flows

- `/register` → verification email → `/onboarding` → authenticated `/home`
- `/login` and secure logout with persistent HttpOnly, SameSite cookies
- `/forgot-password` → recovery email → `/reset-password`
- `/profile`: unique handle, display name, bio, favorite games/platforms/interests, private avatar uploads, and visibility
- `/settings`: private preferences, current-password verification, password change, and confirmed permanent account deletion
- `/people/:username`: minimal, explicitly visible profile; private/missing profiles share an unavailable response

Registration is 18+ with server and database enforcement of age self-attestation. Profiles default to private. Username checks are authenticated and throttled, and no public availability endpoint exists. All user data tables enable RLS. Normal users cannot directly write profile tables or upload arbitrary files.

See [Supabase configuration and security](docs/SUPABASE.md), [screens](docs/SCREENS.md), [architecture](docs/ARCHITECTURE.md), and the [development log](DEVELOPMENT_LOG.md).
