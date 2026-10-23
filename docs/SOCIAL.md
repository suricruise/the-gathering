# Phase 7 social sharing

## Production setup, step by step

Phase 7 requires the completed Phase 6 database. Existing authentication, messaging and LiveKit settings remain in use. No AI service, video transcoder or new public key is required.

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open [`supabase/phase7-setup.sql`](../supabase/phase7-setup.sql), select **Raw**, and copy the **entire file**. Paste it into the new Supabase query and click **Run once**. The transaction installs four versioned migrations together and records their versions. Do not rerun old phase installers.
3. Run this read-only check. The first four results should be `true`; `social_bucket_is_public` must be **false**.

   ```sql
   select
     to_regclass('public.posts') is not null as posts_exist,
     to_regclass('public.post_comments') is not null as comments_exist,
     to_regprocedure('public.social_command(text,jsonb)') is not null as commands_exist,
     to_regprocedure('public.social_report_page(bigint,boolean)') is not null as reports_exist,
     (select public from storage.buckets where id='social-media') as social_bucket_is_public;
   ```

4. In **Vercel → the-gathering3 → Deployments**, confirm the Phase 7 GitHub commit is deployed to **Production**. If the automatic deployment completed before the SQL setup, refresh after the SQL succeeds. Keep `APP_URL=https://the-gathering3.vercel.app` and the existing Supabase environment variables. Secrets remain server-only.
5. Open **https://the-gathering3.vercel.app/feed**, sign in, and create a small post. Use a second account to verify the selected audience, reactions and comments. The feed starts empty until members actually post.
6. Configure a private hourly scheduled job with the existing Supabase URL and server secret to run `npm run social:cleanup -- --hosted`. This removes unused uploads older than 24 hours and media from removed posts/accounts. Run it from this repository with production dependencies installed. Never put its credentials in a browser or public endpoint.

If the installer says **“Social tables already exist”**, stop. Do not drop tables or rerun setup. Check migration history:

```sql
select version, name from supabase_migrations.schema_migrations
where version like '20261026000%' order by version;
```

The expected versions are `202610260001` through `202610260004`. Apply only missing files from [`supabase/migrations`](../supabase/migrations), in order, and record their versions if using SQL Editor. A normal Supabase CLI workflow is `supabase db push` against the intended linked project; review pending migrations first. Existing migration files must not be edited after application.

## Screens and behavior

- `/feed`: personalized **For you**, **Explore members**, **Following** and **My posts** views; community/interest filters; older-post pagination; manual refresh; private composer and media uploads.
- `/feed/:id`: stable post permalink with the same audience rules as every other access path. Missing and unauthorized posts share the unavailable response.
- `/communities/:slug/posts`: membership-required community feed, reached from **View community posts** in a joined community. Its composer cannot switch audiences or communities.
- Posts show real author avatars where profile visibility permits, timestamps, community context, game/interest tags, safe Markdown, media, reactions, comments, own editing/deletion and follow controls.
- **My reports** shows the current member's reports and their persisted status. **Moderation queue** shows only content the current member has permission to moderate. Reports can be dismissed or their target hidden/removed. Hidden content can be restored; removed content cannot.
- Loading, unavailable database, empty filters, upload errors and rate-limit responses have explicit feedback. Publication is confirmed only after the database succeeds. Stable client IDs make retries idempotent. Feed delivery uses explicit refresh; it does not pretend to have a real-time social subscription.

The personalized view selects posts matching the member's joined communities, follows, interests, favorite games or authorship, then orders them chronologically. All filters run after audience authorization. Stable bigint cursors page 20 posts/comments or 30 reports at a time; editing does not move an item to the front.

## Audiences and moderation

All social access requires a verified, live, adult member identity. **All members** means authenticated members, not the public internet. **My followers** is readable by the author, followers and explicitly approved platform moderators. **Only me** is author-only, including against platform moderators. **Community members** requires active membership even when the community is discoverable or public. Audiences and community IDs cannot be widened through edits.

Community moderators/administrators/owners moderate their own community, with hierarchy checks preventing action against peers or higher-ranked members. Platform moderation is separately approved by an operator in SQL Editor; an ordinary profile field or visible admin navigation grants no privileges:

```sql
-- Replace the UUID with the verified intended account's auth.users ID.
insert into private.social_moderators(user_id)
values ('REPLACE-WITH-USER-UUID') on conflict do nothing;
```

Revoke approval by deleting that specific entry. Platform approval never bypasses private-community membership or author-only posts. Role changes take effect on the next server request. Moderation changes and report decisions write an immutable private audit record. Report details are visible only to the reporter and authorized scoped staff.

## Media and external links

Uploads accept four files per post, at most **3 MB each**. Photos/GIFs are decoded, bounded and re-encoded to WebP; filenames are sanitized. MP4 requires explicit sharing-rights confirmation, H.264 video with optional stereo AAC, at most 90 seconds and 1920×1080. A bounded Node worker inspects the complete nonfragmented container, track metadata and sample byte ranges. Unsupported, malformed, oversized or timed-out uploads are rejected. This is format validation, not a copyright verification or malware-scanning guarantee. There is no server transcoding; export clips to these limits before upload.

The worker uses the `mp4box` production package and is explicitly included in Next.js upload-route tracing. Vercel runs it in the Node runtime; no `ffmpeg` installation is needed. The tiny test clip is a synthetic development fixture, never a seeded member post.

`social-media` is private with restrictive Storage policies. Only the validated server upload route can write objects. The application never returns public or signed media URLs. Every `/api/social/media/:id` request verifies identity and current RLS access, then streams private bytes with `no-store` headers. MP4 byte ranges support native video controls. Losing membership/follow access blocks subsequent requests; downloaded content cannot be remotely recalled.

YouTube/Twitch clip links use exact allowed HTTPS host/path patterns and open on their original platforms; there are no automatic third-party embeds. Other links render through safe Markdown. Explicit **Load safe preview** requests reuse the DNS-pinned, redirect-restricted messaging preview fetcher: public HTTPS destinations only, bounded responses/timeouts, text metadata only, no automatic remote images. The stored preview is attached only if the authorized post body still matches the inspected body.

## Authorization and operations

The identity source remains `auth.users`. Seven public tables (`posts`, `post_media`, `post_reactions`, `post_comments`, `follows`, `post_reports`, `post_link_previews`) and three private tables (`social_moderators`, `social_budgets`, `social_audit`) enable RLS. Ordinary clients cannot directly mutate tables, set authors/roles, select storage paths, register another member's uploads, or execute service-only cleanup/preview functions.

Authenticated commands derive the actor from the session, recheck audience/membership/hierarchy, and use committed HTTP request budgets plus direct-command limits. Per-minute limits: 6 posts, 20 comments, 60 reactions, 30 follows, 10 reports, 10 previews, 10 uploads and 30 edits/deletes or moderation actions. Account deletion removes social objects before deleting the identity; failures are reported without falsely claiming account deletion. The database deletion trigger tombstones authored content if deletion occurs outside the app.

## Verification

Run against the loopback test stack only:

```sh
npm run db:test-stack
npm run test:gateway # separate terminal
npm run test:social
npm run test:social:setup
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
npm run test:bundle
```

The authorization tests cover actor isolation, private/follower/community audiences, moderation hierarchy and report privacy, idempotency, media ownership, restrictive Storage policies, cursors, quotas and revoked access. Installer rehearsal is local-only and rolls back all DDL/storage metadata changes. The two-account Chromium flow covers actual persisted photos and playable MP4 ranges, follows, comments/edits, private-media rejection, community posting and report resolution on desktop/mobile. These checks do not replace acceptance testing on your hosted Supabase/Vercel deployment.

## Troubleshooting rejected uploads

Uploads enforce the canonical `APP_URL` before reading any file. A preview deployment address can display posts while its upload is rejected because it differs from that configured origin. Open `https://the-gathering3.vercel.app/feed` directly in a regular browser tab and sign in. In Vercel's **Production** environment, `APP_URL` should be `https://the-gathering3.vercel.app`; redeploy Production after changing it.

Rejected uploads now show **This deployment expects …** and **Browser sent: …**. Compare those addresses. Missing or opaque/null origins require a regular browser tab; they are not accepted as trusted requests. Invalid headers are described without echoing credentials, paths or queries. This diagnostic update needs no SQL migration. If the error continues, share the complete updated error and the address in the browser bar.
