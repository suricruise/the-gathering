# Faith Circles — Phase 8 completion and QA

Date: October 27, 2026 (America/New_York). Implementation baseline: `cfb7651`.

**This is not a declaration of production readiness.** The reference reader and gated YouVersion adapter are implemented. Live licensed delivery remains unverified until approved credentials, translation IDs and display requirements are configured. No production SQL, push or deployment is authorized by this phase or was performed. Deployed sites may still contain older behavior until an approved release.

## Features implemented

- Existing community-backed Circle discovery/membership, approved study leaders/co-leaders, private studies, released structured sessions, personal/shared answers, private reflections, progress/resume and responsive reading remain integrated.
- Circle discussion, session threads/reactions, prayer audiences/private default, encouragement/comments, reports/moderation, scoped notifications and preference checks reuse existing systems.
- Actual LiveKit Study Hangouts, scoped admission/moderation and persistent navigation continue through the original voice manager and worker.
- Study Builder draft editing, ordered/duplicate sessions, image validation/private covers, safe preview, review/feature approval, publication, release and archival preserve stable records.
- New reusable Scripture reader: book/chapter/reference navigation, reference copy, private persistent bookmarks, study-linked workspace and existing authorized Circle/session discussion. The reference-only mode works without a Bible API or copyrighted text.
- YouVersion adapter uses the current official published SDK's REST contract, server-only credentials, explicitly permitted IDs, on-demand plain-text requests, fresh mandatory attribution, validated source links, no-store delivery and safe text rendering. Actual source results are never replaced with invented verses.
- Daily optional Faith & Life reading now uses curated references rather than unverified bundled KJV text/public-domain claims.

## Provider review and licensing

The owner confirmed an approved YouVersion project. No project key or translation list was configured in this environment; translation-specific rights remain unverified. Current official npm artifacts for `@youversion/platform-core` and React UI **2.16.0** were reviewed, including API request and attribution contracts. Official documentation website access returned proxy 403; API.Bible's current terms could not be reviewed and it is not selected. Details and source links: [Scripture integration](docs/SCRIPTURE_INTEGRATION.md).

The SDK's Apache license does not license Bible content. Enabling text requires approved project credentials, explicit translation IDs, and confirmation that deployment territories and plain-text/attribution rules are satisfied. HTML-only/additional display or territorial requirements must be implemented before enabling affected translations. No website scraping or bulk/full-Bible storage occurs.

## Tests actually executed

| Check | Executed result |
| --- | --- |
| Lint, Next route generation/typecheck | Passed; no final lint warnings/errors. |
| Unit tests | **477 passed, 84 files**. Includes reference parsing, provider rights/allowlists/attribution/size/URL guards, authenticated route boundaries, escaped content, status retry and cancellation/metadata reuse. |
| Finite integration/regression commands | **68 passed, 0 failed** on the isolated local stack. The persistent gateway startup command is a prerequisite, not counted as a passing finite test. |
| Reference database/installer tests | Final targeted **12 database cases + 3 installer checks passed**, including ownership, raw-write denial, foreign cursors, duplicate retries, 200-reference limit, account restriction and deletion. |
| Broad browser QA | **35/36 passed in 13.8 minutes** initially; the remaining desktop voice assertion incorrectly required a mounted connection after the PWA had entered its offline document. |
| Final affected study/reader/Hangout rerun | **6 cases passed**. Two added voice fault-injection checks initially failed because their matcher missed the installed SDK's `/rtc/v1` endpoint; this was a harness error, not a fabricated connection. |
| Final reader rerun | **2/2 desktop/mobile passed in 41.6 seconds**, including actual clipboard and refreshed screenshots. |
| Corrected voice rerun | **2/2 passed in 1.4 minutes** after matching the real signaling paths and separating document recovery. Both accounts exchanged decoded audio before and after an actual pass-through server-socket interruption; mute/deafen, navigation, leaving, moderator removal, ban enforcement and browser microphone denial remained asserted. |
| Production build and client-secret scan | Passed. The scan also checked a synthetic server-only YouVersion canary; no real YouVersion project key was available. |

All **36 distinct desktop/mobile cases have successful executions across these runs**, not a single claimed clean 36-case run. Failed/interrupted attempts are not counted as passes. No runtime voice grants, provider, worker or permission checks were weakened or replaced. The reconnect harness forwards real LiveKit WebSockets and terminates only the signaling connection; it supplies no fake messages/media. Browser offline/PWA document reload is a distinct lifecycle that can unload voice and require explicit authorized rejoining. That conditional reload branch is not claimed to have been forced by the final voice run.

Verified workflows cover Circle public/private joins/invites/bans; study access through Circle membership; published/scheduled session navigation; private/shared answers, reflection/progress/resume; Scripture book/chapter/copy/bookmarks and scoped discussion; prayer audiences/encouragement/comments; Hangout scheduling/audio/access/end; study building and independent review; event/mention/reply settings; ordinary community channels; real message/edit/delete/reaction/attachment delivery; offline recovery and 5,000-message pagination/virtualization. Study access is membership-based: there is no separate per-study enrollment table or enroll button to claim tested.

Source and tests caught/fixed an RLS helper-execute permission issue in the new bookmark policy, a redundant provider-status query on every chapter change, and a bookmark-load error that navigation could mask as an empty state. A narrow current-user RLS helper, preserved translation selection with stale-passage clearing, independent reference/bookmark errors, and guarded initial saves address these cases. Existing records/memberships were not reset.

Current visual references: [desktop/mobile reader captures](docs/qa/faith-circles-final/README.md). Targeted axe and strict viewport-width assertions passed. These are local fixture captures, not production members, engagement figures or provider verse content.

## Security and performance findings

- Local inspection confirmed RLS on the 11 inspected Circle/study/response/progress/reflection/Hangout/cover/bookmark tables and confirmed private community-header, study-cover, message-file and social-media buckets. Regression tests exercise the actual authorization functions, not merely hidden buttons. This is not an exhaustive external penetration test.
- Bookmarks have owner-only RLS, no browser writes, authenticated server identity, stable uniqueness, 200/user cap, user-scoped serialization, rate limits, indexed cursor pages and Auth deletion cleanup. No private Circle/session metadata or licensed text is stored in them.
- New provider endpoint rechecks active verified membership and optional exact study scope, fixes the upstream host/path, rejects redirects and unsafe source URLs, bounds payloads/time and suppresses private diagnostics. Missing attribution/rights fail closed. Plain text is React-escaped; no raw provider HTML or arbitrary embeds are rendered.
- Local inspection found no Realtime publication of the new bookmark table. No new WebSocket/presence/media provider is mounted. Existing chat authorization/epoch cleanup and voice enforcement remain authoritative. New provider fetches abort on unmount/reference changes; no automatic passage polling or full-history queries are added.
- Study/question/discussion/bookmark lists remain bounded and paginated. Licensed text and current attribution are neither cached nor persisted; this costs fresh metadata requests per explicit passage read. The 5,000-message browser case passed virtualized pagination/anchor assertions; its overall fixture duration is not a latency benchmark. Provider quota and scale acceptance remain pending.
- Sensitive prayer/reflection data stays separate from discussion and generic notifications. Existing uploads, reports, block/ban and channel/private subscription tests remain required; no production bucket policy was changed by local QA.

## Manual configuration and remaining risks

1. Verify Phase 7 migration history and backup; after separate approval apply the new [reference bookmark installer](supabase/faith-scripture-setup.sql). Existing accounts/Circles/messages are not reset. Record an honest hosted migration result rather than marking unverified history applied.
2. Configure server-only YouVersion project credentials, permitted IDs and rights flags as described in the guide. No translation is activated by default or merely by having a key.
3. Verify actual upstream metadata/content/attribution/source behavior with approved project access. Current contract tests use clearly synthetic payloads and do not prove live content access.
4. Test physical mobile keyboards, Safari/iOS background behavior, real microphones/devices and hosted deployment/worker/Storage settings. Chromium emulation and synthetic microphone input are not physical-device certification.
5. Review provider usage quotas and production-scale traffic, and ensure existing maintenance/reminder/cover-cleanup jobs are scheduled. No new email/push notification delivery is added.

## Suggested next improvements

- Expand the reference catalogue from actual authorized provider book/chapter metadata, including additional canons, languages, versification and cross-chapter ranges.
- Add compatible provider-specific HTML/typography/attribution only after its license and sanitization model are reviewed; preserve server-only keys.
- Complete live-provider and physical-device acceptance before a public readiness claim.
- Consider a controlled new-edition workflow/body-version recovery for curricula; preserve existing published editions and member progress.
