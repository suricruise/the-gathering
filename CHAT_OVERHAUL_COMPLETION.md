# The Gathering chat overhaul — Stage 9 QA

Review date: October 25, 2026 (America/New_York). Baseline application commit: `5ea1653` (Stage 8).

## Verdict and scope

**The existing chat overhaul is functionally verified in the executed local matrix.** The full baseline desktop/mobile production-build browser suite passes **102/102**, and the added actual-socket cleanup suite passes **2/2** separately. Lint, typecheck, all 326 unit tests, the production build, 30 service/database commands, query-plan rehearsal and security/dependency scans pass. No application regression was reproduced by this matrix. Noncritical performance follow-ups and hosted/physical-device/operational acceptance remain open; this is **not a declaration of production readiness**.

This review preserves Supabase PostgreSQL/private Realtime Broadcast, Supabase Auth, LiveKit and the existing communities, memberships, roles, channels, IDs and message histories. Stage 9 adds verification/documentation, not another chat provider or unrelated product features. No production SQL, hosted fixtures, production configuration changes, publication or deployment were performed during this review.

“Verified” below means successfully exercised against isolated local real services and/or the identified automated checks. It does not mean physical-device, hosted-scale, independent security or production-readiness certification. Earlier stage logs are historical context, not substitutes for this run.

## Functionality and evidence

The table maps supported functionality to successfully executed local checks. Items explicitly deferred in Outstanding issues are not represented as implemented or physically certified.

| Area | Implemented behavior | Evidence in this review |
| --- | --- | --- |
| Community switching | Authorized real communities, remembered last channel, no cross-community history | `channel-workspace`, `chat-navigation`, `communities` browser cases; community/workspace/navigation database suites |
| Channel navigation | Text and voice together, categories, persisted collapse, topics, active/unread/mention states, first-unread/message links | Workspace/navigation browser and database cases; native keyboard controls/source review |
| Real-time messages | Persist before private ID-only Broadcast; stable IDs/revisions; optimistic delivery and immutable retry payloads | `messaging`, `reliability` browser cases; actual `test:realtime` transport assertions |
| Compact layout | Grouped author rows, avatars/timestamps, day/unread separators, main scroll with bottom composer | Workspace/messaging browser cases and accessibility/overflow checks |
| Composer | Expandable input, Enter/Shift+Enter/IME handling, touch send, emoji, attachments/drop/previews/progress/errors, mentions | Unit suite and messaging/workspace/browser cases; permission-controlled disabled uploads |
| Reactions | Persisted unique per-user emoji toggle/counts, live updates | Two authenticated messaging browsers; interaction/messaging/Realtime database suites |
| Replies/threads | Existing root/parent IDs, independent paged thread panel/composer, mobile view and return anchor | `threads`/messaging/navigation browser cases; thread scope/pagination database assertions |
| Edit/delete/pin | Author controls and authorized moderation, confirmations, tombstones, live updates, protected audit metadata | Messaging browsers, interactions and administration suites |
| Attachments | Existing private bucket; server size/type/ownership/access checks, staged-file enforcement, authorized downloads | Messaging browser upload/download, Stage 8 policy update, messaging/admin/channel-management database suites |
| Mentions/notifications | Authorized autocomplete, own mention highlight, scoped search, permission-limited mass mentions, mute/mentions/default consent | Navigation/reliability browser cases; navigation and privacy notification database checks |
| Typing | Multiple names, throttled server events, expiry and stop, no permanent message rows | Multi-account reliability browser and messaging/Realtime checks |
| Presence | Preference-gated online/offline, stale/hidden/unavailable behavior | Reliability/people-rail/member browser cases and People/rail database checks |
| Unreads | Monotonic channel receipts, cross-device invalidation, focused/visible read semantics | Reliability/navigation browser cases; receipt/read-state database checks |
| Search/message navigation | Authorized channel/community/author/date/thread filtering, bounded cursor results, original-message/thread deep links | Navigation/thread browser and search isolation tests |
| Moderation/channel permissions | Existing separate platform/community roles, private/post/connect/attachment gates, restrictions, archive/retained deletion, scoped reports/history | Management/admin browsers; community/admin/interaction/channel-management suites |
| Responsive/accessibility | Drawers, responsive panes, native action menus, focus/skip/Escape controls, touch targets and keyboard viewport rehearsal | Desktop/mobile workspace/interface/management/threads cases and axe scans |
| Voice compatibility | Actual LiveKit media, persistent member-layout provider, navigation without disconnecting, mute/reconnect/removal | Two authenticated decoded-audio voice browser cases; actual voice service and worker checks |

## Executed checks

All fixtures connect only to verified loopback services. SQL fixtures roll back; committed Auth/Realtime/browser fixtures clean up their own IDs. No test bypasses authorization to represent a successful message/voice event.

- `npm run lint`, `npm run typecheck`, `npm test`: passed; **326 unit tests, 53 files**. Final lint/typecheck also include the new QA scripts/test.
- Production `npm run build`: passed with the local Supabase configuration, followed by `next start` on port 4173. Browser runs use that production server, not development compilation. Injected hosted credentials were excluded from build/browser commands.
- `npm run test:bundle`: passed; configured server-only secrets are absent from client build artifacts.
- `npm run test:security`: passed for tracked files and Git history, then repeated after staging the new files. Recognized credential patterns are covered, not every possible secret format.
- `npm audit --json`: completed successfully; zero known vulnerabilities at review time. This is a point-in-time registry result.
- **All 30 service/database commands below exited zero**. The commands include **413 numbered database/transport/concurrency/worker checks**, four three-case installer rehearsals and a separate local restore rehearsal; see the exact inventory below rather than treating a command as one assertion.
- `node scripts/audit-chat-performance.mjs`: executed successfully; actual plans and measurements are below. Its fixtures roll back and local statistics are refreshed afterward.
- Production browser regression: `npx playwright test --workers=1` passed **102/102** in **17.3 minutes**, with no failed or skipped cases. The new cleanup test was added after that run was collected and passed **2/2** in a separate focused run (**37.2 seconds**) on the same unchanged application build. Thus **104 distinct scenarios** pass across two runs, not a claimed single 104/104 invocation. Both desktop and mobile projects ran against actual local Auth/PostgreSQL/Realtime/LiveKit services.

| Command (`npm run …`) | Successful checks |
| --- | ---: |
| `test:db` | 21 |
| `test:communities` | 32 |
| `test:messaging` | 24 |
| `test:realtime` | 11 actual transport/API |
| `test:workspace` | 7 |
| `test:interactions` | 10 |
| `test:threads` | 13 |
| `test:chat:reliability` | 7 |
| `test:chat:navigation` | 16 |
| `test:channels:management` | 16 |
| `test:channels:management:setup`, `test:chat:navigation:setup`, `test:chat:reliability:setup`, `test:threads:setup` | 3 per installer (12 total) |
| `test:admin` | 32 |
| `test:voice` | 18 actual database/LiveKit service |
| `test:voice:worker` | 6 |
| `test:people` | 25 |
| `test:people:realtime` | 8 actual transport/concurrency |
| `test:people:rail`, `test:members:rail` | 11 + 8 |
| `test:social` | 29 |
| `test:squads` | 28 authorization + 10 simultaneous joins |
| `test:spaces`, `test:spaces:realtime` | 26 + 6 |
| `test:community:management`, `test:community:headers` | 13 + 12 |
| `test:members` | 15 |
| `test:launch` | 9 |
| `test:recovery` | Full isolated local dump/restore; RLS, private bucket metadata and critical functions present |

Voice browser tests use a generated tone through Chromium capture-test flags and verify decoded audio across actual LiveKit/WebRTC connections. They do not establish physical microphone permission/quality or real-device background behavior.

The broad browser run checks existing features outside chat: registration/verification/onboarding/login/logout, profile/avatar/privacy/password recovery/deletion, communities and banners/order, friend/block/DM consent, social sharing, Squad Up, faith/prayer/event/notification privacy, administration, legal/public pages and PWA offline behavior. All those existing browser cases passed in this run. No non-chat regression was reproduced; this conclusion is limited to the executed matrix.

## Outstanding issues

- Functional regression verdict: no functional failure was reproduced in the 102 baseline and two added browser scenarios or the executed unit/service checks.
- Unchanged receipt/metadata polls can cause avoidable renders and open-pin refetches; the precise source behavior is documented below. No timing profile or production load budget is claimed.
- Search/unread aggregation, large-community notification fan-out and long-session JS-cache growth require production-like capacity measurements; virtualization only bounds mounted DOM.
- Slow-media aspect-ratio shifts and repeated protected downloads remain performance watchpoints. Do not weaken private storage/cache controls as a shortcut.
- Physical mobile keyboard/Safari/background audio, screen readers, hosted worker uptime/removal, credential rotation, Storage recovery and legal approval remain manual acceptance gates.
- GIF provider search, optional away presence and durable private drafts/outbox are intentionally not implemented. Disabled controls do not simulate success.

## Performance findings

### Query plans actually measured

The new reproducible `scripts/audit-chat-performance.mjs` inserts 5,001 root messages and 1,000 thread replies in a local transaction, analyzes the table, executes `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and rolls back. These are a single local PostgreSQL engine-plan sample, **not** authenticated full-RPC/DTO/HTTP latency, percentile/load benchmarks or hosted results. No index or scan type is forced.

| Query | Rows returned | Execution time | Observed access |
| --- | ---: | ---: | --- |
| Latest root page | 40 | 0.041 ms | `messages_root_page` index scan |
| Thread page | 40 | 0.046 ms | `messages_history` index scan |
| Revision catch-up | 200 | 0.102 ms | `messages_changes` index scan |
| Selective search page | 31 | 2.568 ms | Sequential scan |
| Unread count | 1 aggregate | 4.302 ms | Sequential scan |

Root, thread and revision paging use the intended indexes. Search/unread costs grow with eligible history and permission checks: the local planner chose sequential scans despite an existing partial GIN search index. These small-fixture times do not justify a speculative duplicate index. Profile real authorized RPCs with production-like distributions and concurrent membership/notification fan-out before claiming scale; use `pg_stat_statements`/EXPLAIN in approved staging and monitor egress. `test:launch` independently verifies indexed root-history access on its representative fixture.

### Client rendering, subscriptions and media

- Source review confirms stable message UUID/revision reconciliation with unchanged object references, memoized message rows, scoped callbacks and memoized root filters. Typing/connection/receipt UI still causes some parent renders; no React commit-time profile was recorded, so this review does not assert a render-time budget.
- **Noncritical optimization remains:** `receiptSnapshot` maps to a new messages array even when visible read counts are unchanged; `applyState` increments `refreshVersion` on unchanged successful metadata polling. An open pins panel can consequently refetch with the 10-second repair poll. Consider equality guards with receipt/pin regression tests. This is observed source behavior, not a reason to weaken reauthorization or remove repair polling.
- Initial/older/newer root pages are bounded at 40, search at 31 for a 30-result page, receipt batches at 100 IDs and revision pages at 200. Catch-up yields after five pages and schedules more without skipping the revision watermark. Thread history loads on demand; threads share the channel transport rather than adding a second competing message subscription.
- Both desktop/mobile long-history browser cases passed with **5,000 real persisted messages**, more than **1,000 explicitly loaded rows**, reader-anchor preservation, fewer than 100 mounted message rows, live arrivals while scrolled up and recovery of **4,205 genuinely committed missed messages**. The final timeline contains the expected 4,245 loaded rows after catch-up, with no final-row duplicate. These scenarios verify functional paging/DOM bounds, not a concurrent throughput or sustained-memory SLA.
- Cleanup source review confirms effect teardown removes listeners, intervals, reconnect/repair/typing timers, all owned channels and the socket. Async generation/access guards reject obsolete work. The added `chat-cleanup` browser test passed **2/2** (desktop/mobile, 37.2 seconds total) and watches actual private Realtime join frames and socket close events across five client-side channel changes, requiring exactly one owned chat socket after each change and zero after navigating out of chat. It does not count a leave frame as socket closure; both assertions were exercised on actual desktop/mobile browser sockets. The initial test observer assumed object frames; inspection of the installed SDK confirmed Phoenix array frames, and the observer was corrected without changing application behavior or fabricating events.
- Attachments load lazily when mounted; ordinary files download only on click. Images are validated/transcoded/resized server-side; protected routes use private/no-store, nosniff and restrictive rendering headers. Markdown does not embed remote tracking images or trust HTML. No public attachment URLs or authenticated PWA media/history cache is introduced.
- Media rows are dynamically measured, but image metadata is not used to reserve exact aspect-ratio space. Slow-media layout shifts and repeated private downloads after virtual unmounts remain watchpoints. Do not solve this with a public/shared cache. JS memory grows with explicitly loaded history even though virtualization bounds DOM; sustained multi-hour sessions still need a measured cache/window design.

## Error, empty and keyboard review

Source review found explicit connecting/offline/reconnecting/denied states, failed/uncertain immutable send retry, upload progress/error/removal, empty channel/search/pins/thread states, missing-migration management feedback and fetch retry paths. A denied client clears protected content and rejects late responses rather than rendering stale private results. Loading/error displays do not fabricate persisted or connected success.

Browser/interface coverage exercises real responsive pages, native keyboard-accessible menus/details/dialogs, skip links, channel controls, focus restoration, mobile drawers, resize/keyboard viewport and axe scans. Chromium mobile emulation and viewport shrinking do not prove actual iOS/Android virtual-keyboard behavior, background audio or assistive-technology usability. Screen-reader and physical-device acceptance remain open.

## Security review and remaining concerns

- Current local RLS and execute-grant checks pass. Anonymous/unrelated/banned accounts are denied private reads/sends/edits/deletes/subscriptions, search and scoped administration; membership/access changes rotate topics. Role/actor/grants/voice room identity are server-derived; platform and community roles remain separate.
- Real private Broadcast tests reject forged publications, unauthorized/stale topics and rolled-back message delivery. Threads inherit channel access. Same-ID retry/reconnect does not create another persisted message. Sensitive moderation changes are audited and private evidence is role/retention protected.
- Private media authorization, storage and staged-attachment checks pass. Safe Markdown/link validation and existing SSRF/DNS protections remain. File validation is **not** antivirus scanning.
- No new production credential or public media bucket is needed for Stage 9. Secret scans cannot confirm revocation of the server credential historically pasted in chat; operator confirmation of rotation across Vercel, workers and any other consumers remains a high-priority launch gate. Never paste credentials into this report/chat.
- Live voice removal depends on the independent healthy enforcement worker. Do not bypass fail-closed freshness checks. Hosted worker uptime/alerts, network failures and physical two-device media/moderation acceptance remain required.
- The local restore rehearsal verifies database restoration and private bucket **metadata**, not Storage bytes/hashes, hosted PITR/RPO/RTO, provider settings or alert delivery. Existing legal documents remain drafts requiring operator/legal review.
- No hosted penetration test, concurrent production load certification or physical Safari/cellular/background-media certification was performed. See `docs/SECURITY_REVIEW.md`, `docs/KNOWN_LIMITATIONS.md` and `docs/BACKUP_RECOVERY.md` for existing operational gates.

## Manual configurations and acceptance still needed

1. Verify the intended Vercel commit is Ready and the canonical `APP_URL` matches the domain actually used. Keep server secrets out of `NEXT_PUBLIC_*`; maintain Supabase Auth Site URL/redirect allowlists and SMTP/verification configuration.
2. Verify migration history through Stage 8 (`202611120001`) in the intended hosted project. This review applied **no hosted migration**; local state does not prove production state. Use only pending versioned migrations or the corresponding guarded installer, never reset/reseed existing communities or replay older phase setup over them.
3. Verify private storage buckets and authenticated file endpoints, private authorized Realtime topics and membership-revocation behavior with designated staging/hosted accounts. Test search, threads and file access after removal from a private community.
4. Verify matching server-only LiveKit URL/key/secret and a separately hosted healthy enforcement worker. Test real two-way audio between two physical devices/accounts, microphone denial, autoplay recovery, mute/deafen, leave/rejoin, access removal and text-channel navigation while voice remains connected.
5. Run iOS Safari and Android Chrome tests with the real keyboard, photos/files, safe areas, PWA install/offline/return, and Wi-Fi/cellular transitions. Review keyboard-only and screen-reader flows with actual assistive technology.
6. Confirm exposed-key rotation, abuse/SMTP/rate-limit settings, retention/legal policy, worker/operational alerts and backup/Storage restore drill. These are acceptance gates, not automatically resolved by passing local QA.
7. CI currently runs lint/typecheck/unit/security/audit/build/bundle checks on PR/manual dispatch. The real-service database/browser/voice matrix executed here needs an isolated service CI job or a documented release rehearsal; it is not already part of that workflow.

## Recommended follow-ups (not added in this stage)

1. Complete hosted and physical-device acceptance and credential/recovery/operator gates before declaring production readiness.
2. Add measured equality guards for unchanged metadata/receipts, profile React commits and exercise extended-session memory; preserve reauthorization and private media access.
3. Measure large-community unread/search/notification fan-out with production-like authorization and concurrent sessions before adding indexes, summaries or a history cache window.
4. Add a real-service CI release matrix, sustained WebSocket/voice-worker monitoring and scheduled recovery rehearsals.
5. Evaluate attachment malware scanning, authenticated request coalescing/aspect-ratio metadata and an explicitly approved GIF provider. Optional away presence, durable private drafts/outbox and background mobile guarantees remain separate designs, not completed functionality.
