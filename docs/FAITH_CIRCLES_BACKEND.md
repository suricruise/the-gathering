# Faith Circles — Phase 2 backend

Phase 5 discussion/prayer extension: [current implementation, audiences and setup](FAITH_CIRCLES_DISCUSSION_PRAYER.md). New Circle prayers default to author-only; legacy prayer audiences are preserved. Session conversations reuse existing real-time chat.

**Phase 4 update:** the interactive room, answer editing, private application/prayer reflections, explicit completion and server-saved resume are now connected. See [the study-room guide](FAITH_STUDY_ROOM.md). Historical scope/test results below describe their original phase; full curriculum authoring, licensed Scripture and mapped inline answer threads remain separate work.

This stage implements authenticated database/service operations. The existing initial Circle UI remains intact. Guided study authoring, question/answer/progress screens and leader approval dashboards are **not implemented UI features** in this stage.

## Integration and schema mapping

| Requested concept | Existing-system adaptation |
| --- | --- |
| Circle identity, name, slug, description, image, visibility/status | `faith_circles.community_id` remains the Circle UUID and primary key. The linked existing community supplies name/slug/description/secure cover and public/private/discoverable visibility. `discoverable` corresponds to invitation/request-based joining; it does not grant private channel access. Community archive and Circle `enabled=false` gate access. New `created_by` attribution is nullable for historical/operator registrations; no backfill. |
| Circle membership | Existing `community_members` remains authoritative, with its unique community/user key. `faith_circle_members` is a restricted view with a composite Circle/user identity, joined timestamp and leader/co_leader/member projection. A private co-leader overlay grants only study authoring, never platform/community moderation. |
| Bible studies | New `bible_studies`: Circle FK, title/overview, approved existing cover token, creator, duration, draft/published/archived state, revision, rights attestation and timestamps. |
| Study sessions/questions | New `bible_study_sessions` and `study_questions`, unique session numbers and question order, passage references, original teaching/application/prayer prompts and scheduled release. No supplied Bible translation text/API. |
| Structured responses | New `study_responses`, unique author/question, composite question/session FK, stable IDs, revisions, private by default, optional explicit Circle sharing and moderation/removal metadata. These are answers to study questions, not a second chat/message system. |
| Progress | New `study_progress`, unique user/session, completion time and study revision; owner-only reads. Completion retries preserve one record and its original timestamp. |
| Prayer | Existing `prayer_requests` and existing prayer commands/authorization/comments/encouragements. Its community ID is also the linked Circle ID. Add only a bounded title and a removal trigger that erases it when the existing moderation workflow removes content. |
| Requests/invitations | New unique Circle/user join-request records; existing one-use community invitations are retained. Membership creation writes the existing membership table and its audit trigger. |

Circles in this implementation must link to an existing community. Create a community through the existing approved community-creation workflow when needed, then register its Circle; there is no independent community-less membership realm. Nothing converts, reseeds, renames or deletes existing communities.

Images reuse the existing secure community-cover mechanism and approved built-in study cover tokens. This phase adds no arbitrary image URL fetcher, upload bucket, public storage URL or media authorization bypass.

## Authorization and privacy

- All identity comes from verified, adult/onboarded, live Supabase Auth and `auth.uid()`. Both server-side Zod validation and database checks apply. Inputs cannot choose author, creator, approval or platform roles.
- An approved current community administrator/owner may register a Circle. Approval is still controlled by the trusted operator workflow from the foundation. Registration never grants approval.
- The approved primary study leader, explicitly assigned approved co-leaders, and approved community administrators may author/publish. Publishing rechecks current permissions, study revision, lesson completeness and affirmative content-rights attestation inside the transaction. A checkbox attestation does **not** establish a verified Bible translation license; no translation text is bundled.
- Co-leaders cannot assign themselves or promote platform/community roles. Only community administrators/owners may assign another currently approved member. Ban/kick/leave removes or invalidates the overlay; ordinary unbanning does not restore a deleted co-leader assignment.
- Public/discoverable Circle metadata uses the existing bounded directory. Actual study content, sessions, rosters, progress, responses and prayers require current Circle/community membership. Private Circle existence/content remains hidden from outsiders.
- Draft/archived studies and unreleased sessions are restricted to approved study editors. Published editions are immutable; create a new edition for revised lessons. Archiving preserves records. Non-editor readers receive only released sessions of published studies.
- **Private reflections:** only the author can read/edit/remove them, and current Circle/session access is still required. Moderators never receive private reflection bodies through ordinary study APIs.
- **Explicitly shared answers:** eligible members can read them subject to blocks. Authors alone edit; community moderators can hide shared answers with a reason and audit record, without impersonating the author. Removed answers are erased and become private tombstones.
- Progress is private to its owner, including from leaders/moderators. No private progress/answer body is written to community audits or notifications.
- Existing prayers retain `community` or `moderators` visibility. The latter permits only the author and current, unblocked authorized community moderators. Co-leader study access alone does not grant prayer moderation.
- Membership loss, archive, approval revocation, blocks and account suspension/ban are checked on fresh reads and writes. Direct data-table writes are denied. Select grants on study tables are protected by RLS; membership/request/approval internals remain RPC-only/default-deny.
- Existing administration advisory/community locks serialize writes with membership/moderation changes. This intentionally preserves the existing locking model; changing global lock granularity needs separate concurrency/performance review.

### Retention and account deletion

Leaving hides personal responses/progress but retains them for a possible return. Their normal editor/removal API requires current Circle/session access; account deletion remains the available full removal path after access is lost. A more granular offboarding/export/retention UI remains future work. Auth deletion cascades personal responses/progress and existing prayers, while community/study records and minimized audits remain. Existing community ownership-transfer rules still apply.

The migration also hardens Circle audit attribution during Auth FK cleanup and permits clearing historical creator attribution without requiring a revoked successor leader to become active again. These are compatible function updates in the new migration; the released foundation migration is unchanged.

## Typed services

`src/lib/faith-circles/backend.ts` is server-only and uses the existing request-scoped Supabase client, not a service-role bypass. `backend-types.ts` contains strict discriminated input schemas and typed safe output projections. `backend-actions.ts` validates and delegates mutations, then revalidates existing member navigation.

Foundation directory/detail services remain `readCircles` and `readCircle` in `data.ts`.

New named services:

- Circle lifecycle: `createCircle`, `joinCircle`, `requestCircleMembership`, `cancelCircleMembershipRequest`, `acceptCircleInvitation`, `leaveCircle`, `decideCircleMembership`, `setCircleCoLeader`.
- Study authoring: `createStudy`, `updateStudy`, `saveStudySession`, `saveStudyQuestion`, `publishStudy`, `archiveStudy`.
- Reads: `retrievePublishedStudies`, `retrieveLeaderStudies`, `retrieveStudySessions`, `retrieveStudyQuestions`, `retrieveCircleMembers`, `retrieveCircleJoinRequests`, `retrieveMyCircleRequest`.
- Personal/shared data: `saveStudyProgress`, `retrieveStudyProgress`, `saveStudyResponse`, `removeStudyResponse`, `moderateStudyResponse`, `retrieveStudyResponses`.
- Prayer: `createCirclePrayer`, `retrieveCirclePrayers`.

```ts
// Server-side example; circle is an existing community UUID.
const draft = await createStudy({
  circle, id: crypto.randomUUID(), title: 'An original study', duration_days: 7,
});
const studies = await retrievePublishedStudies({ circle, size: 20 });
// On subsequent requests use studies.data?.after as the stable page cursor.
```

Pass stable caller-generated UUIDs for create/retry operations. Session/question authoring and publish/archive commands require the latest **study** revision. Response edits use the response's own revision; identical same-ID retries return its saved revision. A second answer ID for the same author/question is rejected rather than duplicated. Uncompletion explicitly removes the owner's completion record.

SQL entry points are `faith_backend_command(operation, circle, data)` and `faith_backend_read(view, circle, resource, after, size)`. Unsupported operations/inputs fail; returned errors do not echo SQL, tokens or private content. Reads are bounded to 1–40 rows plus a lookahead; sessions/questions paginate by their ordinal using a validated existing UUID cursor, other collections use stable UUID order. Server services strip the lookahead and return `after`. Clients must handle both permission loss and revision conflict, not display simulated saves.

Circle writes use a per-user 60/minute budget; reads 180/minute, plus existing foundation/membership/prayer budgets. At most 100 nonarchived studies per Circle, 366 sessions per study and 50 ordered questions per session. Individual original teaching/answers/prayers are bounded; there are no full-history broadcasts or new Realtime topics. Group conversation/threads/attachments and real Hangouts continue through the existing linked channels/providers.

## Local verification and production installation

Version: **`202611180001_faith_circles_backend.sql`**. It adds data/constraints/indexes, RLS, protected projections/mutations, role/prayer lifecycle triggers and the compatible account-cleanup fixes. No destructive migration, historical data backfill or seed is included.

Only the isolated local development stack was modified. For a future approved release:

1. Back up Supabase and verify migration history and foundation version `202611170001`.
2. Apply **only** `supabase/faith-circles-backend-setup.sql`, or apply its versioned migration through the established migration tool. Do not rerun earlier phase installers over existing tables.
3. Recorded reruns skip. If objects exist without the version record, stop and compare schema/history; do not reset or mark an unverified migration applied.
4. Use the existing trusted leader-approval process. Connect authoring/session UI in a later frontend stage; database installation alone does not create a finished study editor.
5. Re-run hosted acceptance with designated test accounts before broader access. Do not use these local fixture scripts against production.

Rollback application code compatibly while preserving new records. Do not drop study, prayer, community or Auth tables as a rollback. Any schema/data removal needs a separate backed-up review and approval.

## Tests and remaining work

See the development log for executed results. Reproduce local checks with `test:faith:backend`, `test:faith:backend:setup`, `test:faith:circles`, community/Spaces/messaging regressions, the full unit suite and production build. `e2e/faith-circles-backend.spec.ts` exercises actual Supabase authentication/RPC/RLS with two local accounts, private invitations, publishing denial, private reflection isolation and concurrent completion retries. These API checks run in Playwright projects but do **not** claim mobile rendering of an unbuilt study UI. `e2e/faith-circles.spec.ts` separately checks the existing actual desktop/mobile Circle UI and membership/chat integration.

Unfinished: guided study/session UI, leader-authoring/approval UI, a dedicated study-content reporting/review workflow, licensed Bible provider, study-specific notifications and more granular personal-data retention/export controls. Existing community reports/moderation and shared-answer hiding are available backend primitives; they are not described as a new complete study-reporting dashboard. Physical-device audio, Safari and hosted/load acceptance were not rerun for this backend-only stage. Auth, chat and voice infrastructures were preserved.


### Executed results

Local verification on October 26, 2026 (client date): lint/typecheck, optimized production build/start and client-secret bundle check passed; **391 unit tests in 67 files**, **32 backend database checks**, three installer checks and **102 existing database checks** (20 foundation, 32 communities, 26 Spaces, 24 messaging) passed. Final Playwright run passed **4/4 in 50.5 seconds**: two authenticated API runs and desktop/mobile existing Circle interface scenarios. The API run includes four concurrent completion requests yielding one saved record. No skipped checks are counted as passes.

The initial migration was applied in the isolated local stack and draft function/lifecycle corrections were applied and retested there. Installer parity, recorded reruns and ambiguous-state refusal were tested; this is not a claim that a fresh hosted installer or hosted acceptance was executed. No deployed environment was modified. Provider/service access, storage growth and shared-lock contention need hosted-scale monitoring before broad study publishing. No physical-device audio test was executed in this backend stage.
