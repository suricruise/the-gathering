# Phase 12 launch readiness report

Date: 2026-10-23. Scope: release candidate following Phase 11.

**Decision: release candidate prepared; unrestricted public launch remains NO-GO until the gates below are verified.** This report does not certify an untested hosted deployment. No production database changes or live deployment were performed during Phase 12.

## Completed engineering work

Removed obsolete demo screens and the permissive catch-all route. Added ownership-safe account deletion in both server actions and database triggers, bounded administrative member pagination, missing foreign-key indexes and a measured root-message pagination index. Added restricted operational dependency checks, redacted error instrumentation, maintenance freshness tracking, environment validation, dependency/security checks and a non-deploying CI workflow. Updated the vulnerable development test runner; the dependency audit reports zero known advisories.

Added legal review drafts, deployment and administrator instructions, backup/recovery procedures, a user acceptance checklist, and explicit limitations. The Phase 12 migration and installer were exercised only against the isolated local database. Production installation requires approval and a backup; use the exact instructions in [DEPLOYMENT.md](DEPLOYMENT.md).

## Verification evidence

- Lint, TypeScript checking and the Next.js production build pass.
- 208 unit/server/component tests across 26 files pass.
- PostgreSQL checks pass: 21 identity, 32 community, 24 messaging, 29 social, 28 gaming sessions plus 10 concurrent joins, 25 people, 26 faith/events/notifications, 32 administration and nine launch checks. Launch checks include raw Auth owner-deletion rejection, legitimate ownership transfer, RLS, private storage, service-only health functions and a real query plan with 5,000 messages.
- Real service checks pass: 13 Supabase API, 18 database/LiveKit, six worker diagnostics, ten channel Realtime, eight people Realtime, six notification Realtime and four administrative API cases. These use actual local services, not successful-connection simulations.
- Migration installer rehearsals pass, including fresh install, safe rerun, ambiguous-state refusal and rollback. Earlier phase installers also pass their regression rehearsals.
- An isolated database dump/restore drill passes, including data, RLS, functions, grants and bucket metadata. This does **not** restore Storage object bytes or provider configuration.
- Client bundle and tracked-file/Git-history credential scans pass. Scanners cannot prove every historical or external credential is safe.
- All 72 desktop/mobile production-build browser scenarios pass, with no failures or skips. Coverage includes desktop/mobile accessibility, registration, profiles, memberships, private messaging, uploads, social, squads, faith/events, moderation and actual encoded/decoded two-way LiveKit audio using synthetic microphone input.

## Required launch gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| Previously disclosed credential | Rotate the Supabase server secret previously pasted into chat; update all consumers and revoke the old key | Unverified; blocking |
| Hosted authentication | Registration/verification/recovery with production SMTP, exact callback URLs and cookie persistence | Operator acceptance required |
| Hosted authorization | Apply reviewed pending migrations, then verify private tables, buckets, Realtime and cross-account access on the exact release | Operator acceptance required |
| Voice | Two separate physical devices/accounts: two-way microphone audio, mute/deafen, reconnection, permission denial and moderator removal; worker failure closes admissions | Operator acceptance required |
| Operations | Independent health token, scheduled maintenance, failure alerts and restricted log access | Configuration/acceptance required |
| Recovery | Provider backup/PITR availability and encrypted Storage-byte backup; isolated restore with access/deletion reconciliation | Hosted drill required |
| Legal and support | Approve operator identity, contacts, jurisdiction, retention, terms, privacy and community rules | Drafts require review |
| Capacity | Representative concurrency/load testing and provider spending limits | Not measured at launch scale |

Do not treat local browser tests as evidence of production SMTP, physical-device audio, provider backups or hosted configuration. Keep the site in a controlled evaluation until these critical gates are signed off.

## Release and rollback

See [deployment](DEPLOYMENT.md), [operations](OPERATIONS.md), [recovery](BACKUP_RECOVERY.md), [security findings](SECURITY_REVIEW.md), [known limitations](KNOWN_LIMITATIONS.md) and [acceptance checklist](USER_ACCEPTANCE.md).

Publishing to the production-connected main branch can trigger Vercel automatically. Obtain the user's confirmation before publishing/deploying or changing production data. Preserve security fixes when reverting application behavior; do not drop ownership guards, authorization policies or evidence controls as a rollback shortcut.
