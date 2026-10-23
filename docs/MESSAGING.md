# Phase 5: persistent realtime channel messaging

## Deploy on Supabase and Vercel

1. Finish Phase 4 first. Verify the production app is on the current GitHub `main` deployment.
2. For a project without messaging tables, open [`supabase/phase5-setup.sql`](../supabase/phase5-setup.sql), copy the **entire file**, paste into a new Supabase SQL Editor query, and click **Run once** as the project operator. It applies the seven Phase 5 migrations in one transaction and records their CLI versions. Do not rerun the Phase 3 initial setup or Phase 4 migration. If it says messaging tables already exist, stop and inspect the installed migration versions; do not drop existing tables or messages.
3. Alternatively, authenticated CLI operators can use `supabase db push` for the seven ordered `202610240001`–`202610240007` migrations. Earlier manually applied migrations must have their CLI history reconciled first, as documented in the Phase 4 guide. The API keys alone cannot apply SQL migrations.
4. In Supabase **Realtime Settings**, disable **Allow public access** (private-only Realtime channels). The app always requests private channels. Keep the Realtime service current; the migration creates policies on `realtime.messages` but deliberately does not alter its RLS flag, owner, grants, or internal functions. Do not add the application `messages` table to a Postgres Changes publication; delivery uses database Broadcast.
5. Confirm the `message-files` Storage bucket exists and is **private**, with the supplied 3 MB/type restrictions and restrictive policies. Do not add permissive authenticated upload/download policies or make it public. Images/files are served through authenticated application routes.
6. In Vercel, retain the existing secure Supabase variables and set `APP_URL` to the exact production HTTPS origin. The upload and typing endpoints enforce that trusted Origin. Rebuild/deploy the current code after migrations; inspect the deployment commit before promoting it. No extra service key is exposed to the browser.
7. Sign into two separate accounts/browser contexts, join the same community, open a text channel, and wait for **Live** in each. Send a message, reply/react, and refresh to verify persistence. A private channel also needs the appropriate grant. Voice and direct-message services remain disconnected.

Run `NOTIFY pgrst, 'reload schema';` after manually applying individual migration files. The bundled setup already does this. Hosted migrations, Realtime settings, SMTP, and Vercel configuration are operator actions; local tests do not change them.

### Cleanup worker

Schedule `npm run chat:cleanup -- --hosted` hourly on a **private worker** with the project URL and server-only key injected securely. Do not configure it as a browser task. For local verification load only the local environment and omit `--hosted`. The command refuses a non-loopback project without that explicit option and does not print keys, object paths, filenames, or messages.

It removes unclaimed staged files after 24 hours and files belonging to deleted messages, in bounded batches through the Storage API. It also handles orphaned objects after community deletion. Claims prevent expired staging files being attached during cleanup. Failed removals remain eligible for retry. The account-deletion workflow separately removes the authenticated user's message files before deleting the identity; failures report an incomplete deletion rather than pretending success. Account deletion tombstones authored text/replies, clears previews, and nulls identity references; stable IDs and thread structure remain. Moderation metadata remains with nullable actors. Set a retention period for moderation history before launch.

## Verified implementation guidance

Reviewed the current official Supabase guide sources on 2026-10-23, alongside the installed Supabase JS/SSR packages and Next.js bundled server-action/data-security guidance:

- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast): database `realtime.send`, private topics, transactional delivery, and bounded Broadcast payloads.
- [Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes): Broadcast is the recommended scalable database-change approach; database triggers publish committed changes.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channel configuration, SELECT/INSERT policies, topic checks, and cached permission behavior.
- Official [self-hosted compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) and [Realtime source](https://github.com/supabase/realtime): the local service uses the pinned official `supabase/realtime:v2.143.3`, its own real schema migrations, partition maintenance, and logical replication. No Realtime behavior is emulated.

Official documentation pages returned HTTP 403 to the execution environment, so their current MDX source was read from the official Supabase repository. The app uses `RealtimeClient`, re-exported by the installed Supabase SDK, without creating a second browser Auth client.

## Persistence, pagination, and reconciliation

`messages` holds server timestamps, author identity, body, root thread/reply targets, immutable creation sequences, edit/delete timestamps, and revisions. `message_reactions`, private `message_attachments`, owner-private `read_receipts`, server-generated `message_link_previews`, and private moderation metadata normalize the remaining state. All exposed user-data tables enable RLS; ordinary direct mutations are revoked.

Every send uses a client-generated UUID as its stable operation/message ID. A server-authenticated RPC derives the author, checks live text-channel/post permission, validates content/root/files, and commits atomically. Retry returns the original row and never recreates a deleted message. An advisory ID lock handles simultaneous retries. A failed/missing HTTP acknowledgement stays retryable with the same ID; no unsaved message is displayed as delivered. Drafts/staged file IDs stay in component memory, not persistent browser storage. Refreshing loses an unsent draft. Editing a failed draft begins a new logical operation; retry the unchanged draft when acknowledgement is uncertain.

Database triggers call `realtime.send` **inside** the transaction. WAL delivery happens after commit, and rollback emits no committed event. Message/reaction/preview invalidations contain only a stable message ID, not text, files, authors, JWTs, or histories. Clients fetch authoritative RLS-constrained rows, reconcile by ID and exact bigint revision, and preserve newer edits/tombstones. Sequential channel write locks keep reconnect revision watermarks in commit order. This serializes writes within a channel; benchmark hot channels at launch scale rather than treating functional tests as a capacity guarantee.

History/search pages are capped at 40 with creation-sequence keyset cursors. Thread history uses the same bound and separate cursors. Reconnect catch-up is capped at 200 changed rows per page and 20 batches before a latest-page resync. Indexes cover channel/thread creation order, channel revisions, author IDs, attachment lookup, receipt aggregation, and GIN full-text search. Search is within the current authorized channel, with 2–100 character bound parameters. Deleted body content is removed from searchable rows. Search is PostgreSQL simple-token full text, not arbitrary substring matching.

A bookmarked message URL `/channels/<uuid>?message=<uuid>` loads only an authorized message in that channel and highlights it, opening its thread when needed. Links do not convey membership. Root deletion leaves a tombstone and existing replies; new replies to a deleted root are rejected. Edits/deletes/reactions are visible to connected clients and survive refresh.

## Realtime access and reconnect behavior

Topics are `chat:<channel UUID>:<epoch UUID>`, always private. SELECT authorization checks live verified adult identity, active community membership, private-channel view overrides, and the current epoch. Restrictive guards prevent unrelated broad policies widening chat access. Clients cannot publish chat Broadcasts; typing and persisted changes are server-originated. A successful SDK `send` acknowledgement alone is not proof of delivery; tests assert forged events never arrive.

Supabase caches subscription permissions. Membership/role changes, individual/role overrides, channel privacy/type changes, and global identity eligibility/ban changes therefore rotate topic epochs. The old topic receives only a content-free access-change notice. Future events use the new topic. Authorized clients reconnect; revoked clients fail the fresh authorization and clear the message workspace. Missed notices are also caught by a 30-second server session/access check. Never put message content in invalidations, since previously authorized clients may retain cached subscription state until disconnect.

The session endpoint validates `getUser` and the channel before returning only the current short-lived access JWT and topic. The JWT stays in JS memory; refresh tokens remain in HttpOnly cookies. Recheck/refresh runs every 30 seconds. Use short JWT lifetimes and provider abuse limits in production. Realtime connection status is genuine: Connecting, Live, Reconnecting, Disconnected, Offline, or Access unavailable. An online transition/manual reconnect creates a fresh transport and performs catch-up. No auto-send occurs after network restoration: the member explicitly retries an unconfirmed message. Previously downloaded content cannot be revoked from a recipient's device.

Typing uses an Origin-checked authenticated HTTP endpoint and a rate-limited server-derived Broadcast with a six-second expiry. It is separate from Next's sequential action dispatcher, so typing does not queue ahead of sends. These indicators are best effort, not stored message history. Receipts advance monotonically from a visible/explicitly marked persisted message; other readers are exposed only as aggregate counts. Unread counts and dividers are server-backed and distinguish the current member's own messages. A **Mark read** control supports deliberate clearing.

## Rendering, files, previews, and moderation

- Markdown uses `react-markdown` plus GFM, skips raw HTML, rejects executable/credentialed links, adds safe external-link attributes, and renders remote Markdown images as text. It never injects raw HTML, executes code, loads third-party tracking images, or renders arbitrary embeds.
- Messages have a 4,000-character limit. Reactions use eight allowed emoji and idempotent own-user set/unset operations. Own edits/deletes require current channel access; moderators/administrators/owners may delete others' messages with an optional recorded reason. There is no client-editable author or moderator role.
- Uploads are limited to four files per send, 3 MB each (text formats 512 KB). Accepted formats: JPEG/PNG/WebP/GIF, PDF, UTF-8 plain text/Markdown/CSV. The stream is bounded even without Content-Length. Image bytes are decoded with pixel/frame/dimension caps, metadata stripped, and re-encoded to WebP; animated GIFs retain animation. SVG, HTML, executables, unsupported types, unsafe text, malformed images, and oversized data are rejected. PDF admission checks its signature/end marker; files are not malware-scanned.
- Files live in a private bucket under a server-generated channel/user/UUID key. Staged metadata is owner-readable only and cannot be attached by another author/channel. Published files require live message/channel access on every download. Deleted/claimed files are unavailable immediately. Responses use private/no-store, nosniff, and a sandbox CSP; documents are forced downloads as octet streams. No public or reusable signed file URLs exist. Avatars obey the existing profile-visibility API, with initials as the fallback.
- Link previews are opt-in via **Load link preview**, limited to three links and server-side budget. The HTTPS fetch rejects local/private/reserved addresses, credentials and nonstandard ports; validates all DNS results and pins a public address; revalidates each of at most two redirects; caps time and 128 KB HTML; forwards no cookies/auth headers; and refuses compressed/unexpected content. Only bounded title/description/hostname text is stored/rendered. Remote preview images/scripts are not loaded. Failure leaves the ordinary link usable.
- Database budgets: 20 sends/minute, duplicate content blocked for three seconds, 40 edits/deletes/minute, 60 reaction operations/minute, 30 typing signals/minute, 10 upload admissions/minute plus 20 registrations/15 minutes, and 20 preview requests/minute per account. Database errors roll back their statement's budget increment; these are application budgets, not an IP-level DDoS defense. Configure provider/gateway rate limits and observability for production. Load, penetration, and malware scanning are separate operational work.

## Verification

Run against the real local stack/gateway:

```sh
npm run db:test-stack
npm run db:seed:communities
npm run test:gateway
# Another terminal using the local environment:
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:communities
npm run test:messaging
npm run test:integration
npm run test:realtime
npm run test:e2e
npm run build
npm run test:bundle
```

Do not point integration/browser fixtures at hosted services. Injected hosted variables take precedence over `.env.local`; unset those application variables for local tests. The direct Realtime test reads its local file explicitly and refuses non-loopback hosts. Tests cover committed delivery, rollback, concurrent retry, lost/offline delivery, reconciliation, private reads/subscriptions, unauthorized edits/deletes, moderation, thread relationships, reactions, receipts, rate/size/type limits, SSRF boundaries, file isolation/revocation, cleanup claims, and identity deletion. Browser flows use two real authenticated contexts at desktop/mobile sizes, with axe/overflow/browser-error checks. Full verification results are recorded in `DEVELOPMENT_LOG.md`; this is functional/security validation, not a production load certification.
