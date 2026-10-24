# Friends and online members sidebar

The right sidebar keeps **Around the gathering**, followed by **Friends**, then **Online members**. Each person is a compact avatar/initials and display-name link, with no status subtitle, handle, role or contact buttons. The same sidebar appears on Home, community, text and voice pages. The right rail remains hidden at narrow widths; Members navigation and the new profile pages remain available on phones.

Click a name to open `/members/<id>` inside the authenticated app shell, preserving ongoing voice. This profile provides Add friend, pending/cancel, incoming accept/decline, accepted friendship/removal and messaging when allowed. These actions use the existing consent, locking, rate limits and authorization. Private profiles show basic membership/friendship identity and permitted contact actions, without private biographies, games or avatars. Public/member-visible details come from the existing independently authorized profile projection. Blocks, account suspension and loss of shared access are checked on the server and in database functions.

Friends includes accepted friends only, regardless of whether they share their status. Online members contains nonfriends in shared active communities who explicitly enable community presence. On channel pages it is scoped to that channel's community and verifies channel access. Elsewhere it uses joined communities. No global directory or email search is added. Duplicate friend rows are excluded from Online members.

## Presence privacy

**Friends & messages → Privacy → Community online status → Share online status with fellow community members** is off by default and saved independently. It does not broaden the existing **Share online status with friends** setting. When enabled, visible-browser heartbeats update community presence; it expires after 90 seconds without a pulse. Exact activity timestamps are never returned by the rail. Hidden/offline tabs do not send new pulses. A recently closed or hidden tab may remain online until expiry.

The online list polls every 30 seconds while visible/online, refreshes on relationship/block changes and reconnect/visibility events, and uses stable UUID cursors with 25 rows per page. Membership and privacy changes appear on the next read, usually within 30 seconds, rather than through a public presence topic. The friends section uses existing private personal Realtime updates. Listeners, timers and stale responses are cleaned up on navigation. Each section has separate loading, empty and retry states, and long lists scroll within the rail.

## Production update

The additive migration is `202611040001_people_rail.sql`, after `202611030001_member_directory.sql`. No new environment variables, Storage buckets or external services are required.

1. Obtain approval and back up according to the normal production procedure.
2. Open `supabase/people-rail-setup.sql`, choose **Raw**, copy the entire file into **Supabase → SQL Editor**, and run it.
3. The installer records the version and skips recorded reruns. If it finds objects without a migration record, inspect history rather than dropping tables or rerunning earlier phase setup. `pg_advisory_xact_lock` output is normal.
4. Deploy the matching application and check its commit is **Ready / Production** in Vercel.
5. Use two designated accounts in the same community: opt into community presence, click the online member's name, request/accept friendship, verify the member moves into Friends, then test opt-out, block and private profile restrictions.

Before the migration, existing friend data is still available; new online/profile services show a setup error. The additional heartbeat RPC is optional during a rolling release so existing friends-only presence keeps working. Roll back the app to a reviewed compatible release while keeping the additive columns/functions; never reset social tables or weaken blocks. Existing privacy payload fields are kept stable for older strict preference forms.

Local verification results are in `DEVELOPMENT_LOG.md`. Automated Chromium tests do not certify physical Safari/mobile behavior or very large community load. No hosted migration or deployment is implied by this guide.
