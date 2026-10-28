# Personal profile cover images

Open **My profile → Profile cover image** to choose a JPG, PNG or WebP up to **2 MB**, review a local preview, then explicitly upload. The centered image appears above the avatar on the member's full profile and on their own Around the gathering card. Remove requires confirmation and restores the built-in navy/purple/cyan background. Avatars and community banners are unchanged. The original clipped decorative circle is removed from the mini-card, with a non-shrinking full-width header at narrow widths.

The server verifies Supabase Auth and derives the owner, rate-limits changes, decodes still raster images with Sharp, caps pixels, rotates/crops to at most 1600×600 and re-encodes metadata-free WebP. SVG/animated/invalid/oversize images are rejected. The current 3 MB server-action request limit is unchanged; the 2 MB input limit stays below it and Vercel's function payload limit. This limit is separate from community header uploads.

Covers reuse the existing **private avatars bucket** with distinct `user-id/cover-UUID.webp` paths. Browsers cannot write storage or the new mapping table, and cannot invoke the service-only commit RPC. Reads verify live Auth, live owner/viewer accounts, profile visibility and mutual blocks before an authenticated private/no-store image endpoint downloads the current object. A public profile does not make the file publicly downloadable. Conditional updates serialize changes and reject stale tabs. Profile images are decorative, with the existing name/handle/avatar retaining the accessible identity. Failed image downloads fall back to the built-in background.

## Installation and release

The additive migration is `202611250001_profile_covers.sql`. Apply **`supabase/profile-covers-setup.sql`** after the prior Scripture migration is recorded, and only with production approval. The installer skips an already recorded migration and refuses ambiguous unrecorded objects. It creates no users, communities or messages and changes no existing privacy settings or bucket policies.

Without this migration the ordinary profile and default header remain usable, and the upload controls explain that setup is needed. Deploy the code after approval. No new environment variables or providers are required. Existing private avatars storage, server-only Supabase secret, and Supabase Auth must already work. Both profile and persistent shell read the new metadata through permission-checked RPCs; no profile/history list is fetched to paint the card.

The existing account-deletion workflow removes **all** objects in the member's avatars folder before deleting Auth identity, including cover files. The mapping has an Auth FK with delete cascade. Replaced, confirmed rejected-commit and removed objects are deleted through the Storage API. An uncertain network response retains the new private object instead of deleting a cover that might already have committed; refresh to see canonical state. If a Storage API cleanup fails, an unreachable private orphan may remain until account cleanup/operator maintenance; no public URL is produced. Do not delete the avatars bucket or change its policies to fix uploads.

Rollback: roll back application code, retain the additive table and private files, and disable upload controls if needed. Do not drop member data or rerun old migrations. Files already read cannot be recalled; fresh requests recheck privacy and blocks. There is no offline cache or upload queue.

## Verification

Run `npm run test:profiles:covers`, `npm run test:profiles:covers:setup`, unit tests and desktop/mobile `e2e/profile-covers.spec.ts` against an isolated local stack. Also run existing profile/discovery browser regression, lint, typecheck and build. Never run fixtures against hosted/production projects. The implementation's actual results are recorded in DEVELOPMENT_LOG.md; physical-device cropping and mobile photo-library testing remain manual acceptance.
