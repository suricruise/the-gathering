# Administrator operating guide

See [Phase 11 role/setup detail](ADMINISTRATION.md). Before public launch assign a verified platform owner, named on-call operator and trained moderators; establish a real restricted support/appeal contact. The app does not invent that contact or provide anonymous identity verification.

## Each shift

- Review the scoped **Overview** and **Reports** queues, pending **Appeals**, upcoming events and current voice admissions. Use the narrowest scope/permission needed.
- Check restricted operational health, provider error rates, SMTP delivery, database/storage/egress usage, maintenance completion and LiveKit worker logs. Public liveness alone is insufficient.
- Handle reported private prayers only within the prayer community controls. Platform access does not provide unrestricted private-prayer or DM browsing. Central DM evidence contains only voluntarily reported items.
- Use factual, concise action reasons without passwords, email addresses, diagnoses or unnecessary personal details. Review relevant evidence, preserve privacy and apply the least intrusive appropriate action. Central self-report/subject decisions and peer/superior restrictions are enforced transactionally.
- Process appeals independently where practical. Accepting an appeal records a decision; restoration/unbanning is a separate explicit audited action. External appeals for restricted members must be independently verified before **Lodge verified external appeal**.

## Common controls

Account suspensions are bounded; bans are indefinite. Community bans affect only that community. Role grants are separate from bans and never come from client metadata. Only the platform owner appoints platform administrators/moderators. Community administrators cannot appoint platform staff or promote themselves.

Archive a community or disable a channel to stop audience access and new admissions. Rotate/restore access carefully after review. Room removal revokes the admission and imposes a 15-minute suspension; the independent worker enforces actual LiveKit removal, normally on its next two-second pass. A stale/unhealthy worker blocks new admissions; never bypass this guard to make a button work. A 401 from LiveKit generally requires checking that URL/key/secret belong to the same project. Origin mismatch errors require the canonical site and matching `APP_URL`, followed by a proper deployment.

Transfer community ownership through existing owner controls before deleting an owner account. Platform ownership transfer is a separately reviewed trusted database-operator procedure, not a self-role button. Confirm a verified active successor and successful access before the former owner attempts deletion. The new database trigger also blocks direct Auth Admin deletion of owners, preventing ownerless communities/platforms. Operators should not demote/delete the last owner with ad hoc SQL.

## Private monitoring

Generate an independent random `OPS_HEALTH_TOKEN`, configure it as server-only in the app, and store it in your uptime monitor's secret header field. Use `Authorization: Bearer …` with `/api/ops/health`. Unauthorized requests receive no dependency details. Authorized 200 requires application RLS, private buckets, migration presence, fresh voice enforcement, fresh daily maintenance and a successful LiveKit room-service request. The endpoint returns booleans, never room names, participant IDs, emails or provider error payloads. Missing configuration, stale jobs/worker or dependency failures return 503.

`/api/health` returns only liveness. Alert after bounded retries (for example, two failures in a minute), route alerts to your actual on-call service and test delivery. The repository does not claim an external alert provider is configured. Monitor Vercel structured `server_error`, `health_failed` events and client boundary digests. Application event envelopes intentionally omit messages, URLs, headers, cookies and user content; provider/framework logs have separate retention/access controls. Do not add broad request-body logging. Add a reviewed log drain/error provider if required; there is no Sentry or third-party browser tracker silently enabled.

Daily jobs: `moderation:cleanup`, `chat:cleanup`, `social:cleanup`, `squad:cleanup`, all with explicit `--hosted` when approved. Each records successful completion; failed jobs must alert. The optional reminder pass runs every five minutes and remains consent-gated. Evidence expiry conceals text/media immediately; cleanup erases expired references and releases removed/orphaned files. Provider backups, audit retention and published original media have separate policies.

## Incident response

1. Limit impact: disable affected channels/rooms or suspend an account with an audit reason. Keep the enforcement worker healthy; do not disable RLS or publish a bucket to diagnose an issue.
2. Record timing, deployment commit, redacted event digests and relevant audit IDs in a restricted incident record. Minimize personal data and preserve necessary evidence under retention rules.
3. If credentials may be exposed, revoke/rotate them and update every consumer. Revoke sessions as appropriate. A password change/global sign-out revokes refresh sessions; already-issued short-lived access tokens rely on live database status/authorization checks.
4. For a release regression, use the approved rollback procedure. For provider/data loss, isolate a restore and reconcile valid blocks, bans and deletions before reopening access.
5. Complete post-incident review, notification/legal assessment, verification and any user communications through the operator's approved process. The application does not automatically send incident emails.

Review staff permissions, retention policy, provider access/MFA, stored secrets and legal/support contacts regularly. Run the [user testing checklist](USER_ACCEPTANCE.md) after material configuration, SDK or policy changes.
