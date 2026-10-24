# Working on The Gathering

## Scope and preservation

- This is an existing Christian gaming and pop culture community application. Improve it incrementally; do not rebuild it, introduce a parallel app or replace Supabase chat/Auth/PostgreSQL or LiveKit without a demonstrated need and explicit user authorization.
- Preserve all existing communities, channels, categories, users, roles, memberships, messages, replies, tombstones, reactions, files and stable UUID/deep-link relationships. Never delete/recreate records or reseed communities as a UI shortcut.
- Preserve working features outside chat: registration/onboarding, profiles, current public/presence defaults and later member opt-outs, friends/blocks/DMs, social posts, Squad Up, faith/prayer privacy, events, notifications, administration, uploaded community banners and PWA behavior.
- Keep VoiceProvider at the existing persistent member-layout boundary. Internal channel/community/profile navigation must not disconnect real voice or capture a second microphone stream. Reuse existing app navigation and mobile drawers.
- For **Task 1 audit-only requests**, modify documentation only (`CHAT_OVERHAUL_PLAN.md` and this file). Do not implement the redesign, apply SQL, seed data, run cleanup, create test accounts, deploy or modify production data. A later explicit implementation instruction may authorize the corresponding plan stage; this audit alone does not.

## Before an implementation stage

- Read `CHAT_OVERHAUL_PLAN.md`, the relevant code/tests and the applicable messaging/community/voice/operations guides. Some early architecture documents describe services as disconnected; confirm current routes, ordered migrations and recent development-log evidence before acting.
- Read the installed Next.js documentation described below before changing Next APIs. Use the lockfile/installed SDK types for actual versions; do not assume a different Next/LiveKit API or add a second auth/router/provider client.
- Establish the stage's preserved behaviors and acceptance tests. Keep a small, reviewable diff and document completed work, verification and limits after an approved implementation stage.

## Authorization and private data

- Enforce live authorization on the server and in RLS/RPCs for every read, send, edit, delete, upload, download, search, subscription and voice operation. Never rely on a hidden button, cached role or client-controlled actor/room/grant.
- Derive identity from verified Supabase Auth and `auth.uid()`. Keep platform roles separate from community roles, and preserve view/post/connect distinctions, private/disabled channels, archive/ban/suspension gates and explicit permission overrides.
- Preserve committed persistence before Broadcast, stable send IDs, exact bigint sequence/revision handling, tombstones, channel write locking, bounded cursors, private epoch topics and reauthorization on access changes. Reconnect/retry must not duplicate messages or resurrect deleted content.
- Keep private buckets and authenticated media endpoints. Validate file ownership, content/size/type and current channel access. Do not expose storage paths, service secrets or private files through public URLs or shared caches.
- Retain safe Markdown, SSRF/DNS protections for previews, notification consent, blocks, profile/presence opt-outs and least-privilege moderation/evidence access. No unrestricted embeds, public presence topics or client-published message events.
- Keep secrets server-only and out of source, command output, browser bundles, logs and documents. Do not log raw chat content, tokens, private URLs or unnecessary personal information.
- Do not cache authenticated chat/RSC/API/media or queue unsent content in the PWA. Any draft persistence/offline queue is a separate privacy/retry design, not an incidental UI change.
- Use actual LiveKit audio and server permission checks. Never simulate voice success, bypass worker freshness or widen token grants to fix a presentation problem.

## Database and release safety

- Prefer existing models/RPCs for layout work; no migration is needed merely to group existing categories or restyle messages.
- If an approved stage genuinely needs schema changes, use additive, versioned, backward-compatible migrations with RLS/grants, measured indexes, rollback/recovery notes and isolated tests. Do not edit already published migrations, reset schemas, run old phase installers over existing tables or remove provider-owned Realtime internals.
- Do not replay one-time account-default backfills over members' later choices. Inspect migration history when state is ambiguous; never mark an unverified migration applied or delete objects to make setup succeed.
- Require explicit user confirmation before production SQL or live deployment. Pushing `main` triggers Vercel, so it is a live action. Finish the concrete implementation/checks before requesting release confirmation. A Git push is not proof that Vercel is Ready or that hosted migrations are installed.

## Verification after each approved stage

- Run `npm run lint`, `npm run typecheck` and relevant existing unit tests (`npm test` for the full unit suite). Add meaningful behavior/security tests for new risks; do not replace assertions with implementation mirrors or weaken access checks to accommodate new markup.
- Run the affected real local tests for behavior changes: `test:communities`, `test:messaging`, `test:realtime`, People/member-rail and administration checks as applicable; Playwright messaging/interface/voice scenarios must cover desktop and mobile when the shell/composer/navigation changes.
- Integration/browser fixtures must use a verified isolated local/test environment. Injected hosted variables override `.env.local`; never point fixture, migration, seed, deletion, recovery or cleanup commands at hosted/production projects. Do not use `--hosted` to bypass test guards.
- Verify two authenticated accounts, private-channel denials, same-ID retries, reconnect/access loss, edit/delete/reactions/attachments, pagination/deep links and persistent real voice for affected stages. Include keyboard/IME/touch, focus, reduced-motion, scroll anchors and mobile keyboard behavior when relevant.
- At milestones run `npm run build` and `npm run test:bundle`; before release run the established regression/security suite. The build pre-step rewrites tracked PWA assets, so do not run it during a documentation-only audit unless explicitly authorized to include that artifact change.
- Report exactly what ran and passed, what is only historical/source evidence, and any physical-device/hosted/load testing still missing. Do not declare production readiness from mocks, Chromium emulation, a build or an unverified deployment.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
