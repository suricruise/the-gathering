# Member lists and easier friendships

## Where to find people

- **Members** in the main navigation opens `/members`. Choose a community and select **Show members**. Mobile users can open **More → Members**.
- Each community page has **Open full member list · Add friends**, plus its own member cards.
- Desktop text/voice channel pages show a community member rail on the right. The channel page also has a **Browse community members · Add friends** link for phones and smaller windows.
- **Friends & messages → Add friends** opens username search. A leading `@` is accepted. **Browse community members** provides an alternative when a peer does not enable global discovery.

Search a community by display name or handle, filter by community role, or show online friends. Full directories load 30 members at a time with **Load more members**; compact rails load 12. IDs provide a stable cursor and incoming pages reconcile by ID. The community picker loads up to 200 joined active communities, ordered by the platform's configured display order. It does not scan the public directory to infer memberships.

## Friend and conversation controls

Member cards show **Add friend**, an actual **Request sent / Cancel request** state, incoming **Accept request / Decline**, or **Friends**. Message actions appear only when the recipient's current policy permits them. More actions include removal of an existing friendship, blocking and reporting. The global search keeps authoritative results visible after an action instead of clearing the whole result list.

A request is not an accepted friendship. The recipient must accept through Members or Friends & messages. Personal private Realtime updates refresh the relationship/presence view. Compact rails also refresh every 30 seconds while visible and online; full directories have a Refresh control. Manual refresh/relationship changes restart pagination from the first page. No invented people or simulated online statuses are added.

## Privacy and permissions

Community names, display names, handles and fixed community roles are basic membership information, already available to fellow members in the previous roster. They do not make a private profile globally discoverable. Private biographies, games/interests and avatars are not exposed by the new list. Profile links appear only when the existing profile projection permits them, and the actual profile/media endpoints independently recheck access.

Global discovery still requires discovery opt-in and a member-visible/public profile. Within a shared community, an active verified/onboarded member may send a request to another active verified/onboarded member only if that recipient allows requests. This fixes the old requirement to make a private profile globally discoverable before a fellow member could add them. No privacy default is changed silently.

Direct messages remain friends-only by default. An explicit recipient **Any verified adult member** opt-in permits a community peer to open a conversation; **Nobody** still rejects it. Conversation history and sends remain participant/policy-authorized. Presence is exposed only for accepted friends who opt to share it, never as a fabricated offline status for people whose status is private.

Social lists exclude mutual blocks, banned community memberships, globally suspended/banned accounts and uncompleted profiles. Outsiders cannot enumerate even public-community member lists without membership. Channel-based rail queries also verify channel access, including private channels. Staff retain the separate, existing bounded moderation/role roster, which can identify blocked or banned subjects for legitimate moderation without exposing private profile details. Ordinary legacy roster reads now honor mutual blocks too.

Every server action verifies Supabase Auth and validates inputs. Database functions derive the actor from Auth, verify live membership/access, and enforce request/DM consent, pair/admin locking, idempotent friendships, existing notification preferences and request/control budgets. Only ID-free invalidations are broadcast on the existing authorized personal topics; complete member lists and histories are not broadcast. No direct client table writes or service-role browser access is added.

## Production setup

One additive migration is needed after community management: `202611030001_member_directory.sql`. There are no new secrets or Storage buckets.

1. Obtain approval for production changes and back up first.
2. Open `supabase/member-directory-setup.sql`, choose **Raw**, copy the entire file and run it in **Supabase → SQL Editor**.
3. It records the migration and safely skips a recorded rerun. If objects exist without a record, stop and inspect history; do not delete tables or rerun old phase installers. `pg_advisory_xact_lock` output is normal.
4. Deploy the matching application. Before the migration, existing chat/friend services remain unchanged; the new directory surfaces a setup message instead of simulated results.
5. With designated accounts, test a private community's list, direct friend request, recipient acceptance, DM consent, request opt-out, mutual block, role/member revocation and phone navigation. Check that a nonmember cannot use either community IDs or private channel IDs to enumerate members.

The migration adds three authenticated RPCs, an active-members paging index and a block guard to the ordinary legacy roster. Existing table RLS/grants remain enforced. Roll back app behavior using a reviewed compatible release while retaining privacy guards; do not drop member/friend tables or weaken blocks to fix access errors. Production load testing for very large communities remains a separate operational gate.

Automated verification and any infrastructure limitations are recorded in `DEVELOPMENT_LOG.md`. No production migration or deployment is implied by this document.
