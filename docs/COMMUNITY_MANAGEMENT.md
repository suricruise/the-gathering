# Community deletion and display order

## Where to find the controls

Open **Admin dashboard → Communities**. Select **Platform** scope to manage the whole directory, or a particular community to manage that community.

### Choose the display order

Platform owners and platform administrators can expand **Display order** on a community card. Set **Community display position** to a whole number from 0 to 999999, enter a short reason and click **Save display order**.

Lower numbers appear first on both **Home** and **Discover**. For example, use 0 for Arc Raiders, 1 for the next community and 2 for the next. Home features the first three communities the signed-in member is permitted to see. Matching numbers sort by community name, then ID. Existing and newly created communities default to 1000. The order is shared by everyone; it is not a personal preference. Community-only staff cannot reorder the platform directory.

### Permanently delete a community

Platform owners/administrators can delete any community. A community owner can delete their own community, including an archived one. Community administrators, moderators and standard members cannot permanently delete it.

1. Expand **Permanently delete community** on the intended community card.
2. Read the deletion notice. This removes its memberships, channels, channel messages/threads, community posts, events, prayer requests and linked community gaming sessions. It does not delete member accounts or unrelated communities.
3. Type the exact **community address** shown in the notice, such as `arc-raiders`.
4. Enter a reason and click **Permanently delete community**.

Deletion is irreversible through the app. Archive remains available when you want a reversible change. Deleting the central Gathering community also removes its content and default spaces; choose carefully. Do not delete a real community simply to test the feature.

Authorization is verified again on the server and inside the database transaction. Incorrect confirmation leaves the community intact. An audit record preserves the actor, target UUID, reason and action time. Necessary reported evidence remains under the existing retention policy and is not exposed to former community staff. Backups and retained evidence do not disappear immediately.

Voice access fails as soon as its channel/admission records disappear. The existing always-on LiveKit enforcement worker removes rooms that are no longer authorized on its next successful pass; no default recording is added. Keep that worker healthy. Private attachment and header cleanup jobs remove eligible unused media; existing evidence holds remain enforced.

## Production installation

This is an additive update after community header uploads. No live database is changed by publishing source code.

1. Obtain approval for the production migration and deployment. Back up the database and Storage bytes first.
2. Open `supabase/community-management-setup.sql`, choose **Raw**, copy the whole file and run it in **Supabase → SQL Editor**. It applies migration `202611020001` and records it. A recorded rerun safely skips; ambiguous existing objects cause it to stop without deleting anything. `pg_advisory_xact_lock` output is normal.
3. Alternatively, apply the pending versioned migration `202611020001_community_management.sql` using normal migration tooling. Do not run both as unrecorded fresh installations.
4. Deploy the matching application. There are no new environment variables or Storage buckets.
5. Test order and deletion with a disposable community and two accounts. Confirm the removed community disappears from Home/Discover, private content remains inaccessible and the audit survives. Verify voice room removal and maintenance on the hosted deployment before relying on production cleanup.

The app retains the prior authorized directory if the new directory RPC is not installed yet. Management actions explain that the database update is needed; they do not simulate success. If rolling back application code, keep additive database authorization and audit safeguards. Recover accidentally deleted data only through the approved isolated backup/reconciliation process.
