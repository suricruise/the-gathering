# Security findings and remaining risks — Phase 12

Scope: tracked repository, versioned SQL and local real-service tests. This is an engineering review, not an independent penetration test, regulatory opinion or verification of hosted configuration. No production database, provider setting or live deployment was changed during this phase.

## Findings addressed

| Finding | Resolution and verification |
| --- | --- |
| Development-only screens reachable through catch-all fallback | Removed the fallback route, five obsolete screen modules, sample data/cards, simulated social reactions and demo friend fallback. Explicit real routes remain; unknown paths use the actual not-found boundary. Removed related demo CSS and obsolete copy/date. |
| Owners could delete accounts while still owning communities/platform | Added an early authenticated deletion preflight plus an authoritative Auth-table deletion trigger, serialized with role/ownership controls. No client identity or UI visibility is trusted. Standard deletion, failed owner deletion and transfer-then-delete are tested. |
| Critical development dependency advisories | Upgraded Vitest to 5.0.5 and its resolved transitive dependencies. The rerun npm audit reported zero known advisories across runtime and development dependencies. This is a point-in-time registry result, not a guarantee against future advisories. |
| Missing deletion/scope indexes and root-history sort | Added 53 previously uncovered FK-prefix indexes for live/user-owned data, scoped report/audit/retention indexes, and a partial root-message pagination index. The root-page EXPLAIN rehearsal uses the index with 5,000 fixture messages. Indexes increase write/storage cost; validate production scale and maintenance locks. |
| Administrative member lists truncated at 50 | Added stable sequence cursor pages while retaining prefix search, scope filtering and live permission checks. Other existing histories already use bounded cursors; never load complete message histories or broadcast histories. |
| No restricted operational dependency check | Added service-only database health/completion RPCs and an independently bearer-authorized endpoint. It checks RLS/private buckets, worker freshness, maintenance freshness and LiveKit connectivity without returning identities/provider errors. Public health is liveness only. |
| Build configuration and secret placement hazards | Added build/production environment validation, canonical origin checks, public-secret rejection, tracked/history credential-pattern scanning, bundle secret scanning and PR/manual verification CI. Values are never printed by validation. |
| Missing operational/legal release documentation | Added deployment, administrator operations, backup/recovery, user acceptance, known limits and launch gates, plus public clearly marked legal/community-rule drafts for review. Drafts are not represented as adopted policies. |

## Authorization, uploads and privacy review

Every local application table in `public`/`private` enables RLS. The anonymous security-definer execute allowlist contains only `visible_profile` and `visible_avatar`, which return explicit visibility-filtered projections. Private role, evidence, budget and operational tables remain inaccessible to ordinary clients. Platform and community roles remain separate; live role checks occur under the shared mutation lock. Direct RLS/RPC/private-topic and privilege-escalation tests are part of the verification suite, rather than relying on hidden controls.

All three media buckets are private. Server-side upload authentication, operation budgets, size/dimension/format checks, WebP conversion and MP4 inspection remain enforced. Raw browser uploads and unrelated file reads fail. Evidence media streams only after a fresh scoped authorization check and respects expiry; protected attachments never receive public URLs. Non-image downloads are not executed inline. Markdown uses a safe renderer; external previews require HTTPS/public addresses, bounded fetching and DNS-pinned safe destinations, with unsafe redirects refused. No new external preview or analytics provider was introduced.

Authenticated pages, APIs and private bytes are not shared-cacheable. Supabase Auth remains the identity source; no client-supplied user ID/role becomes the actor. Account deletion requires reauthentication, tombstones shared content, removes dependent private records/files, and retains only authorized safety/audit material under policy. Backups and original published media have separate retention constraints; deletion is not falsely described as erasing every provider copy immediately.

## Remaining launch gates and risks

| Severity / state | Risk and required owner action |
| --- | --- |
| **High — unresolved verification** | A Supabase server key was previously pasted into the setup conversation. Rotation/revocation and replacement across every consumer are unverified. Confirm rotation before public launch; source scanning cannot establish that an old key is revoked. |
| **High — hosted acceptance pending** | No independent staging/production SMTP, RLS/storage/private Realtime, deployment commit, worker uptime or physical two-device voice acceptance was performed here. Run the user checklist with designated accounts and record evidence. |
| **High — operational dependency** | Active voice revocation depends on the independent LiveKit worker. New admissions fail closed when its heartbeat is stale; an already-connected hostile client is not guaranteed disconnected solely because its join JWT expires. Monitor/restart the worker and verify hosted failure/removal behavior; do not bypass freshness guards. |
| **High — recovery acceptance pending** | Local SQL restore passed; hosted PITR, Storage-byte/hash restore, provider configuration recovery, RPO/RTO and alert delivery remain unverified. Complete an isolated staging drill before launch. |
| **Launch gate — policy approval** | Terms/privacy/community rules are review drafts. Supply legal operator identity, jurisdiction/rights, effective dates, support/privacy contacts and approved retention/consent procedures. Do not present drafts as final policies. |
| **Moderate — abuse coverage** | Registration has application/provider attempt budgets but no CAPTCHA client. General downloadable files are format-validated, not antivirus-scanned. Assess launch exposure, SMTP quotas, malware scanning/attachment restrictions and signup abuse controls. |
| **Moderate — age assurance** | 18+ checks are enforced from self-attested date of birth; they are not third-party age verification. Private birth-date retention and any stronger assurance requirement need operator/legal review. |
| **Moderate — confidentiality boundary** | Messages are not end-to-end encrypted. Authorized staff can access voluntarily reported evidence within scope, and community staff see private-to-moderators prayers. Explain these boundaries; avoid placing unnecessary sensitive personal data in content or audit reasons. |
| **Moderate — performance evidence** | Local query-plan fixtures are not multi-region/high-concurrency load tests. Private/no-store media increases egress and daily cleanup/index work grows with data. Measure chosen-plan budgets and real workloads before scaling. |
| **Operational limitation** | No external alert/log-drain provider, anonymous identity-verified appeal service, email/push notification delivery or provider backup policy is silently configured by this release. In-app features and review workflows remain real. |

No hosted pass, risk waiver or production readiness is inferred from the local test results. See the launch report for the explicit go/no-go decision.
