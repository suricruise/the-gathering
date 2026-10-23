# Phase 4: communities and channel access

## Install

Apply `supabase/migrations/202610230001_communities.sql` **after the four Phase 3 migrations** using `supabase db push` with an authorized database connection, or paste the entire migration into the project's Supabase SQL Editor. `supabase/initial-setup.sql` remains the Phase 3 baseline; existing installations must not rerun it. No hosted migration is applied using a publishable/service API key. If you apply this migration manually and later switch to CLI deployment, reconcile its history with `supabase migration repair --status applied 202610230001` on the linked project before `supabase db push`; do this only after the entire migration succeeded.

For isolated development:

```sh
npm run db:test-stack
npm run db:seed:communities
npm run test:gateway
# In another terminal, with the local environment configured:
npm run dev
```

The seed deliberately requires a loopback database. `supabase/seed-communities.sql` creates The Gathering, Co-op Adventures, Competitive Play, Creative Worlds, Community categories, and general / introductions / looking-for-group / the-hangout / private moderation channels. Moderators receive an explicit view grant for seeded private moderation channels. The central community also keeps gaming, prayer-requests, and wins-and-highlights channels for existing navigation links. Repeating it inserts only missing records and preserves settings, memberships, roles, and overrides. Seeded communities are real persisted development records, not simulated people, membership counts, or connections. Production community provisioning is a deliberate operator action; do not automatically import development data at deployment.

## Approve hosts and assign the first owner

Approval is an operator action in the SQL Editor/database, **never a user-editable role, JWT metadata field, client flag, or public admin-shell button**. Find the verified adult user's UUID in Dashboard → Authentication → Users, and substitute it in this SQL. Never use an email or a submitted client ID to authorize a session.

```sql
-- Allow one verified account to create communities (safe to repeat).
insert into private.community_creators(user_id)
values ('VERIFIED-USER-UUID'::uuid)
on conflict do nothing;
```

Approved members can use **Discover → Create a community**; the creator becomes owner atomically. A seeded community initially has no owner. To bootstrap its first owner, use a trusted database connection:

```sql
begin;
-- Serialize against normal membership/ownership commands.
select id from public.communities where slug = 'the-gathering' for update;
insert into public.community_members(community_id,user_id,role_id)
select c.id, u.id, 'owner'
from public.communities c
join auth.users u on u.id = 'VERIFIED-USER-UUID'::uuid
join private.account_security s on s.user_id = u.id
where c.slug = 'the-gathering'
  and u.email_confirmed_at is not null and u.deleted_at is null
  and (u.banned_until is null or u.banned_until <= now())
  and not exists (
    select 1 from public.community_members m
    where m.community_id = c.id and m.role_id = 'owner'
  )
on conflict (community_id,user_id)
do update set role_id = 'owner', status = 'active';
commit;
```

Inspect the result before granting authority. The unique partial owner index also prevents two owners. Operator actions have a null actor in the database membership audit when no authenticated request context exists; SQL Editor access is itself privileged. Remove creation approval with `delete from private.community_creators where user_id = 'USER-UUID'::uuid`; this does not remove existing community roles.

Owners transfer ownership to another active member before leaving. Account deletion still works: memberships, approvals, and individual overrides are removed; audit actor/target references become null. An owner should transfer first. If an owner deletes their account without doing so, the community remains available to its members and administrators, and a trusted operator must assign a replacement owner using the bootstrap procedure. Ownership never silently passes to an ordinary member.

## Visibility and permission contract

All community routes require a real, email-verified session. Database authorization additionally checks the identity still exists, is age-eligible, verified, and not globally banned. RLS makes the same decisions for direct API calls. Completing gamer onboarding remains required for the home dashboard; the database community boundary requires verified adult identity.

| Visibility | Discovery/details | Join | Channels and roster |
| --- | --- | --- | --- |
| Public | Verified adult accounts | Self-service | Active community members |
| Discoverable | Verified adult accounts | Invitation | Active community members |
| Private | Active community members only | Invitation | Active community members |

Discovery shows up to 200 accessible communities. Search and joined filters operate on those rows. Member rosters show up to 500 entries; invitation management shows the latest 100, security activity the latest 50. These limits are explicit rather than implying that an unbounded directory has loaded. There is no anonymous community/member directory. Member display names and handles are deliberately shared with fellow community members even when their separate gamer profile is private; emails, birthdays, preferences, interests, and avatar storage paths are not exposed.

| Role | Permissions |
| --- | --- |
| Member | Read accessible channels and roster, leave, accept invitations |
| Moderator | Member permissions, issue/revoke member invitations, remove/ban/unban lower-ranked members, inspect security activity |
| Administrator | Moderator permissions, community/category/channel settings, permission overrides, assign/remove moderator/member roles below own rank |
| Owner | Administrator permissions, appoint administrators, transfer ownership to an active member |

Nobody can manage themselves or a peer/superior through role/moderation commands. Administrators cannot appoint another administrator; only owners can. Owner transfer demotes the former owner to administrator in the same locked transaction. Bans demote the target to member, exclude the target from active membership, prevent self-join and invitation acceptance, and immediately remove access. Unbanning restores the member role; existing channel overrides remain until reset, but cannot bypass a current ban. Removal does not prevent future joining a public community; banning does.

Public channels still require verified active community membership. Private channels additionally require an explicit role or individual view grant. Owners and administrators always retain channel access. A matching deny wins over matching grants; denied view also denies post/connect. Phase 5 enforces post permissions for messages, reactions, typing, and attachments. Connect flags reserve the boundary for future voice transport. Leaving deletes individual overrides; role overrides cannot grant community management powers. Category and override composite foreign keys prevent cross-community references. Channel names are lowercase and unique across their entire community, including text/voice and different categories. Category names are unique case-insensitively per community. Order values run from 0 to 999, then names break ties.

All ordinary direct table writes are revoked, including role definitions, audit rows, and membership rows. Validated, security-definer commands derive the actor from `auth.uid()`, lock the community to serialize membership/permission changes, check authority again, and mutate transactionally. RLS read policies use narrowly scoped helpers to avoid recursive membership queries. No service-role client is used for community application reads or writes.

## Invitations, audit, and UI

Invitation creation uses a server-generated 256-bit random bearer token, storing only its SHA-256 digest. Even staff cannot select token digests. The full link is shown once in the action result; share it privately. A link expires after seven days, works once, always grants member, can be revoked, and cannot bypass a ban. The accept page deliberately reveals no private community metadata before acceptance. It sets noindex and no-referrer metadata. Do not log invitation URLs or send them to analytics. There is no automatic email delivery or public invitation-preview API.

A database trigger records membership/role/status inserts, changes, and removals independently of the app. Community commands additionally record settings, category/channel, permission, moderation, and invitation actions. Audit records contain no invitation tokens/digests or profile secrets. Staff can read them; ordinary users cannot change or delete them. Identity deletion nulls identity references while preserving the security history. Define an operational audit-retention policy before public launch.

The directory, community page, member list, host settings, invitation acceptance, and channel workspace use real data and action feedback. Four bundled original landscape cover images can be selected; arbitrary cover uploads are not implemented. Mobile channels use a native modal dialog with Escape, focus containment/restoration, and large controls; desktop has channel navigation. Native details panels organize settings, server actions provide pending/error/success states, and unavailable/missing/private channels never fabricate content. Phase 5 connects channel messaging; voice transport remains disconnected.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:communities
npm run test:integration
npm run test:e2e
npm run build
npm run test:bundle
```

Use only the local environment for integration/browser checks. If secure hosted variables are injected into the shell, unset the four application variables for those commands so the ignored local file can load; never copy hosted values to local files. SQL authorization tests run inside a rolled-back local transaction. Browser tests create isolated real local identities/communities and clean them up.
