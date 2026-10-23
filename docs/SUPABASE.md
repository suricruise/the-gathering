# Supabase setup and security contract

## Hosted project configuration

This phase is implemented and validated against real local Supabase Auth, PostgREST, Storage, and PostgreSQL. Hosted migrations and deployment are separate operations. No hosted credentials from chat are copied into this repository. Rotate any server secret that has been posted in chat before using the hosted project.

Set these in secure deployment/environment settings:

| Variable                               | Purpose                                                        | Exposure                                      |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project API origin, such as `https://your-project.supabase.co` | Public configuration                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (legacy anon keys also work)          | Publishable; protected by RLS                 |
| `SUPABASE_SECRET_KEY`                  | Supabase secret key, or legacy service-role key                | Server only; never prefix with `NEXT_PUBLIC_` |
| `APP_URL`                              | Canonical application origin                                   | Non-secret; use HTTPS for public launch       |

Use the actual deployed app origin for `APP_URL`, never an untrusted request header. Rebuild after changing `NEXT_PUBLIC_*` variables. Do not commit `.env.local` or put service-role keys in browser code. The cloud draft declares the required variables and a server-secret binding scoped to `klkwwieabhtayfxfdqec.supabase.co`; saving that draft does not supply values, apply migrations, or publish the environment.

The normal app uses authenticated, RLS-constrained clients. The server-only privileged client is restricted in application code to abuse-limit accounting, transformed avatar Storage operations, and deleting the reauthenticated user. It is not used to bypass RLS for routine profile reads or edits.

### Apply migrations

For a **fresh hosted project**, open [supabase/initial-setup.sql](../supabase/initial-setup.sql), copy the entire file into Dashboard → SQL Editor → New query, and click **Run** as the project owner. It applies all four migrations in one transaction and records their versions for future CLI updates. It refuses to run when application tables already exist; for an existing installation, apply only pending migrations. Do not rerun the initial setup over an installed app.

Missing migrations prevent authentication: the app requires `consume_auth_rate_limit` before calling Supabase Auth. A real exhausted budget produces “Please wait”; an unavailable function/service produces an authentication-unavailable response and a server log containing only a diagnostic code. Never bypass the limiter to work around missing setup.

Alternatively, use the Supabase CLI with an authorized database connection, or run the SQL in the Supabase SQL editor in version order:

1. `supabase/migrations/202610220001_profiles.sql`
2. `supabase/migrations/202610220002_avatars.sql`
3. `supabase/migrations/202610220003_active_member_visibility.sql`
4. `supabase/migrations/202610220004_avatar_policy_boundary.sql`

For a linked project, the standard CLI workflow is `supabase link --project-ref <your-project-ref>` followed by `supabase db push`. Use secure CLI authentication/database settings; do not paste credentials into command history or chat. A publishable key or service API key alone does not provide PostgreSQL migration access. The migrations are forward-only and must not be edited once applied.

Existing `auth.users` are not silently grandfathered into the 18+ community. If a project already has accounts, plan a deliberate age-eligibility backfill before enabling them. The new-account trigger requires eligible birth-date metadata, including for administrative account creation. No birthdays are inferred from untrusted, mutable metadata after registration.

### Authentication settings

- Enable email/password registration and **Confirm email**. Disable anonymous sign-ins. Use at least a 12-character password minimum.
- Enable secure password changes, email-change double confirmation, provider abuse/rate limits, and production SMTP. Add CAPTCHA at the provider layer if required by launch traffic; no CAPTCHA success is fabricated in this app.
- Set Site URL to `APP_URL`. Allow exact redirect URLs for `<APP_URL>/auth/callback`, `<APP_URL>/auth/callback?next=/reset-password`, and `<APP_URL>/auth/confirm`. Avoid broad production wildcard redirects.
- Configure the confirmation and recovery email templates from `supabase/templates/`. They use `TokenHash`, not fragments containing access tokens:
  - Confirmation: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  - Recovery: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- Default Supabase PKCE emails are also supported: signup uses `/auth/callback`; recovery uses `/auth/callback?next=/reset-password`. The callback exchanges a one-use code using the HttpOnly PKCE verifier cookie. Default PKCE links must be opened in the browser that initiated the request. The supplied token-hash templates also support opening email on another device.
- Set an appropriate short JWT expiry and refresh/session lifetimes. Sign-out/password changes revoke refresh sessions; already-issued access JWTs follow Supabase’s expiry rules. Protected app pages and mutations additionally call `getUser()`. Member-only profile/avatar projections verify the viewer still exists, is verified, is age-eligible, and is not currently banned.
- Use HTTPS. Preserve `Set-Cookie` and `Cache-Control: private, no-store` at reverse proxies/CDNs. Never cache authenticated HTML, RSC payloads, callbacks, or avatar responses publicly.
- If deploying behind another origin, configure Next.js Server Actions allowed origins narrowly and ensure the trusted proxy controls forwarded-host headers. Do not disable Origin/Host checking.

## Local development

### Standard Supabase CLI

With a suitable Docker runtime:

```sh
npm ci --cache /workspace/.npm-cache
npm run db:start
node scripts/local-env.mjs
npm run dev
```

`db:start` starts the relevant services and applies versioned migrations to the local stack. `db:migrate` applies newly added migrations to an already running standard CLI stack. `local-env.mjs` captures only locally generated development credentials into ignored `.env.local` with mode 0600; it refuses to overwrite an existing file and never prints credentials. `SUPABASE_HOME` is directed to a writable workspace path in cloud commands. On another machine, select an appropriate writable path.

### Smaller integration-test stack

In this cloud instance the standard CLI’s bundled database image exceeded the Docker runtime’s unpacking space. The tested fallback uses official Auth, PostgREST, and Storage images with a smaller official PostgreSQL 17 image:

```sh
npm run db:test-stack
npm run test:gateway
# In another terminal:
npm run dev
```

The startup helper generates isolated local-only keys, creates test-service roles, runs the real Auth/Storage schema migrations, then applies the app’s versioned SQL migrations with checksum tracking. Subsequent runs reuse the stack and validate already-applied checksums. No hosted project is modified. Files under `.local-stack/` and `.env.local` are ignored and private. It refuses to overwrite an existing `.env.local`. The gateway binds only to loopback and exists solely to route local test requests; it is not a production gateway. Its services and roles are intended for integration testing, not public deployment.

Stop only this stack with `node scripts/test-stack.mjs --stop`. That command preserves its volumes. Processes must be restarted in a new cloud task; do not assume Docker volumes or running connections were included in a filesystem snapshot.

Local ports: application 3000; browser-test app 4173; API gateway 54321; PostgreSQL 54322; Mailpit 54324; internal test Auth/REST/Storage endpoints 54325–54327. All service ports bind to loopback. Mailpit receives actual test emails without external delivery. Browser tests override `APP_URL` to the 4173 origin.

## Identity, data, and access control

- `auth.users` is the sole identity source. No application passwords or client-editable role columns exist.
- A signup trigger validates the supplied birth date and stores immutable age evidence in `private.account_security`. The server also validates age in UTC before registration. This is age self-attestation, **not independent identity/age verification**. Public launch remains 18+; consider additional age-assurance requirements as part of launch policy.
- `profiles`, `user_preferences`, `user_games`, `user_platforms`, `games`, and `platforms` all have RLS enabled. Private age evidence and abuse-limit tables also have RLS, no public-schema exposure, and no anonymous/authenticated table privileges.
- Profiles default to `private`. Raw profile rows, preferences, interests, and favorite relations are owner-readable only. Direct user-data table mutations are revoked; validated, fixed-search-path RPCs derive identity exclusively from `auth.uid()` and update the caller’s records transactionally.
- `visible_profile(username)` is the explicit opt-in projection. Public means anyone with the handle; members means an active, verified adult member; private means only the owner. The projection contains only ID, username, display name, bio, visibility, avatar presence, favorite game names, and platform names. It never returns email, DOB, interests, raw metadata, storage paths, or private settings. Public profile pages are marked noindex; that is a search preference, not access control.
- There is no public directory, username-list API, or handle-availability endpoint. Username claims require a verified authenticated account, use a case-normalized unique constraint, and consume a persistent account budget even on collisions. Failures are generic. Public opt-in handles are intentionally discoverable by exact lookup; no unique-claim mechanism can make every conflict unknowable.
- Registration/recovery responses avoid confirming account existence. Login uses a generic failure. Application auth attempts use an HMAC-address budget shared across operations; Supabase must also enforce its own provider/IP abuse limits because direct Auth API traffic bypasses the application form.
- The default service mutations in this phase never use a submitted user ID or role. Server Actions enforce Next’s Origin/Host and body-size protections and then independently authenticate and validate their inputs.

## Avatars

The `avatars` bucket is private with a 2 MB WebP limit. There are no anonymous/authenticated policies granting access to this bucket. Restrictive guards also deny ordinary access if unrelated broad permissive storage policies already exist or are added later. Only the server may upload after verifying the current user, rate budget, actual decoded image format, size, and dimensions. PNG/JPEG/WebP inputs are decoded and re-encoded to a maximum 512px WebP; animation, SVG, malformed bytes, excessive dimensions, metadata, client filenames, and arbitrary object paths are rejected or discarded.

Object names use the verified user ID plus a server-generated random UUID. The profile pointer RPC checks ownership and object existence. Failed pointer saves trigger compensating cleanup; replaced files are removed on a best-effort basis, and account deletion removes all files under the user prefix, including possible old/orphaned uploads.

`/api/avatars/:id` checks visibility on every request, streams private storage bytes through the server, and sends `private, no-store`. It never exposes a permanent public URL, storage object path, or reusable signed URL. Unauthorized/missing images both return 404. A viewer who already downloaded an image can retain a copy; privacy controls cannot revoke previously copied data.

## Account deletion

The member must type `DELETE` and reauthenticate using the current password against the email from the verified session. The server cleans that user’s avatar prefix through the Storage API, then deletes only the authenticated identity through Supabase Admin. Foreign keys cascade application records and age evidence; a trigger removes the raw-ID profile-rate record. HMAC-only auth abuse records expire by budget and are pruned when older than 24 hours on subsequent auth attempts; schedule housekeeping if the project requires strict wall-clock deletion of inactive technical records.

Storage cleanup and identity deletion are separate service operations. A failure reports that deletion did not complete and leaves the identity available for retry; some already-removed avatar files may be gone. This phase has no live chat/feed records to retain or delete. Add explicit retention/deletion policies when those services are introduced.

## Validation commands

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

`test:db` runs transaction-rolled-back PostgreSQL RLS/isolation assertions. It uses the isolated smaller-stack database when present; `TEST_DATABASE_URL` can select an explicit test database. `test:integration` refuses hosted URLs and uses real local services. Browser fixtures also refuse to mutate hosted accounts, create unique local test accounts, and clean up after each test. Missing local services produce explicit failures/skips, not claimed passes. Keep traces and `.local-stack/` out of version control because they may contain temporary test credentials.
