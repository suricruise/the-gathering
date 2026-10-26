# Premium Digital Lounge — profiles and social discovery

Implemented October 26, 2026. This evolves existing routes, Supabase Auth/profile services, friendship/privacy/DM rules and persistent LiveKit provider. No account, community, membership, message, attachment, favorite game or platform is reset.

## Member experience

- `/profile`: semantic premium banner, existing secure avatar editor, identity/bio/visibility editing, broad multi-select interests and original games/platforms. A direct link opens existing presence/discoverability/request/message privacy controls at `/messages?tab=privacy`.
- `/members/[id]`: original gradient cover/initial artwork, real authorized avatar/name/handle, permitted presence, existing connection/message actions, visible bio, explicitly shared interests, public and mutual communities, preserved gaming subsection. Owner gets Edit profile. Contact permission does not imply permission to view the full profile.
- `/people/[username]`: retains anonymous public/member/private profile visibility; authenticated interest/community metadata is additionally checked. Anonymous visitors are asked to sign in for community connections. No new anonymous preference/member-list endpoint.
- Owner and directory profile links now use member routes, retaining the member-layout voice provider. The public share URL remains supported.
- Reusable `MiniProfileCard` is used in the global right context panel. It contains actual current-member identity with the existing authenticated avatar endpoint, original cover artwork and a member-profile shortcut.
- Friends & messages → Discover adds up to twelve recommendations. Username search remains paginated and existing friend/block/report/message operations remain authoritative.

## Interests and recommendations

Supported broad interests: Gaming, Movies & Television, Music, Books & Comics, Technology, Creativity, Sports, Food, Outdoors, Faith & Life and Casual Conversation. Original casual/competitive/co-op/events/streaming choices remain valid and selected. Existing `creative`, `faith` and `conversation` IDs receive broader display labels, never rewritten IDs. Maximum sixteen choices matches the union of historical and broad choices.

Onboarding retains three steps: identity, multiple interests, optional gaming. At least one interest is required to complete onboarding. Games and platforms are optional at both server and database validation layers; existing selections are submitted unchanged unless the owner deselects them.

**Full interests are opt-in on profiles.** `share_profile_interests` defaults false for every existing and new account; no historical selections are publicly exposed by this migration. Discovery's pre-existing opt-in behavior can expose only overlapping interests to a verified viewer, even when the full profile list is not shared. The editor explains this distinction. Existing discoverability/presence/visibility choices are not backfilled.

Recommendation eligibility reuses `private.people_visible`: live actor/target, opt-in discoverability, nonprivate profile and no mutual block. Score = number of distinct shared interests + 2 for any mutual active community + 1 for an accepted friendship. Candidates need one of those signals; ties use username; twelve returned. No activity/popularity fabrication or emails. Community identities are not included in recommendation cards. Existing paginated username search is unchanged.

`lounge_profile` first checks the existing `visible_profile` projection and live-account checks. Communities are limited to thirty, ordered by existing host order/name/UUID, with active target membership. Only public communities or communities where the viewer is also an active member are included, and `community_access` must pass. Nonmutual private/discoverable memberships stay hidden. Blocking, losing shared membership and account suspension affect fresh reads immediately. A previously rendered page is not a continuously synchronized privacy feed: reload/navigation fetches fresh authorization.

The new `gaming` and `movies-tv` preferences are recognized by existing Hangouts suggestions. Social posts retain their existing validated tag contract in a separate constant: broad profile choices are not advertised as unsupported social post filters. Extending social tagging is a future coordinated API/schema task.

## Database installation and release

New additive migration: `supabase/migrations/202611160001_lounge_profiles.sql`.

It adds one owner-only preference column, expands the existing interest constraint, replaces the existing validated profile save function compatibly, and adds `save_lounge_profile`, `lounge_profile`, `lounge_people`. Existing profile functions/IDs/game relationships remain. New RPCs are authenticated only, fixed search path, budgeted, server-derived identity; preference tables retain owner-read RLS and no client write grants. Profile writes keep username uniqueness, generic errors, catalog validation and existing save rate limits. Sharing choice and validated save commit in one function transaction.

Only the isolated local database was updated during implementation. Production SQL and live release need explicit confirmation.

For an existing fully migrated project:

1. Back up the database and inspect migration history.
2. Open **only** `supabase/lounge-profiles-setup.sql`, copy its complete contents into Supabase SQL Editor, and run after production approval. Do not rerun old profile/People/community phase installers.
3. The wrapper takes the standard advisory lock and records version `202611160001`. A recorded rerun skips. Existing new objects without a record cause a refusal; inspect history rather than deleting objects.
4. Check `share_profile_interests` exists, RLS remains enabled on `user_preferences`, and the three new RPCs exist. Confirm the version is recorded. Existing profiles should retain selections and the sharing flag should be false unless explicitly chosen.
5. Publish the approved app commit and verify Vercel Ready independently. No new environment variables or buckets are required.
6. Test two distinct real accounts: onboarding without gaming, edit/reload interests, opt-in/opt-out, private/blocked discovery, friend controls and permitted messages. Retest phone keyboard and voice while navigating profiles.

Schema is backward compatible with existing callers of `save_my_profile`. Prefer roll-forward fixes. Reverting the app to pre-broad-interest validation after members save new interest values can prevent their old editor from saving; use maintenance/read-only access or a compatible application rollback. Do not remove new columns/values or reset selections to force an old application to run. Restore data only through the documented backup/recovery procedure and explicit production approval.

## Performance and remaining limits

Reads are uncached authenticated requests; no profile/preferences go into PWA caches, local storage or public storage URLs. Relationship projections use existing user/community membership indexes; there is no new per-card browser membership lookup. Recommendations are requested once per mounted Discover section or explicit retry, not continuously polled. The right-panel mini profile reuses current identity without another fetch. Profile metadata is loaded on demand.

Recommendation output is bounded, but ranking evaluates eligible candidates and membership signals. Large hosted-dataset query plans, pagination of recommendations beyond twelve, cross-device privacy invalidation of an already displayed profile, profile banner uploads and physical iOS/Android keyboard/screen-reader acceptance remain follow-ups. Covers use original CSS artwork, not a new upload system. No provider, voice grant, Auth architecture or public-member email access changes.

## Executed verification

Final verification: 359 unit tests in 63 files, 100 local service checks in six suites, and 18/18 desktop/mobile browser scenarios on the completed production build pass, plus a corrected 2/2 profile viewport/accessibility review. Lint, typecheck, build, configured bundle scan and tracked source/history scan pass. See the Phase 6 development-log entry for run details and corrected test fixtures. Local verification includes lint/typecheck, full unit suite, production build/`next start`, real authenticated registration/profile/avatar/People/browser flows, profile preference persistence, non-gaming onboarding, private/block and community isolation, responsive overflow and axe, real two-account LiveKit decoded audio while navigating profiles and other pages, and source/bundle secret checks. Browser media uses generated capture input through actual LiveKit; it does not certify physical microphones or separate physical devices. Hosted deployment and manual device acceptance are not implied.
