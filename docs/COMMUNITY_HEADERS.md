# Community header images

Community owners and administrators can upload, replace or remove custom header images. Moderators and ordinary members cannot change them. Headers appear on the community page and its Discover card; removing one restores the chosen cover artwork.

## Using the feature

1. Open **Discover** and select your community.
2. Scroll to **Community settings → Community header image**.
3. Choose a JPEG, PNG or WebP image up to 3 MB. A wide image around 1920 × 640 works best; smaller screens crop the center.
4. Click **Upload header image** and wait for the saved notice.
5. To restore the built-in artwork, click **Remove header image**.

Create the community first, then upload its header. Changing the fallback artwork does not remove a custom image.

## Installation / deployment

This feature needs one additive migration after Phase 12: `202611010001_community_headers.sql`. Existing live databases are not changed automatically by GitHub or Vercel.

Before production execution, obtain approval and back up the database and Storage files. Open `supabase/community-headers-setup.sql` on GitHub, click **Raw**, copy the entire file, and run it in **Supabase → SQL Editor**. It skips an already recorded migration. If objects exist without a migration record, stop and inspect history rather than dropping tables. `pg_advisory_xact_lock` output is normal. Normal migration tooling can apply the versioned migration instead; do not run both as fresh installations.

Deploy the matching app after the migration. The migration creates the private `community-headers` bucket itself; do not manually make it public or add browser upload policies. Existing three media buckets are unchanged. No additional environment variable is required.

Run `npm run community:cleanup -- --hosted` on the private daily maintenance worker. The included retention workflow runs it after the other cleanup jobs when that workflow is enabled. It removes unused objects older than one hour, including abandoned uploads and files left when a community is deleted. It never removes current headers. Backup and recovery must include this bucket's actual object bytes as well as its metadata. Header images belong to the community; transferring community ownership does not erase them when the former owner deletes their account.

## Security and implementation

- Authenticated reads use live community RLS. Private headers are inaccessible to nonmembers, including through guessed image URLs. Downloads use private/no-store headers; no public or signed Storage URLs are returned.
- Browser Storage reads/writes are denied. The server verifies Supabase Auth, canonical origin, current community administrator permissions and rate limits before upload. The database rechecks permissions under the shared administration transaction lock before saving/removing.
- JPEG, PNG and static WebP are decoded with pixel limits, orientation-corrected, resized and converted to WebP without source metadata. SVG, animated images, oversized payloads and invalid bytes are rejected.
- Registered paths must match the authenticated uploader, community and generated version and correspond to a recent server-uploaded object with matching MIME/size. Mutations are audited. Failed or replaced uploads are removed immediately where possible, with scheduled orphan cleanup as a fallback.
- The operational dependency health check now verifies all four private media buckets.

Verification results are recorded in `DEVELOPMENT_LOG.md`. Local tests do not certify a production migration or deployment.
