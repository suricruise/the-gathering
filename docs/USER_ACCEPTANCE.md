# User testing checklist and release evidence

Use two designated adult member accounts, an unrelated third account, community staff and platform staff in **staging first**. Use separate browsers/devices. Do not use real sensitive prayers or abusive material as fixtures. Record date, app/worker commit, provider projects, browsers/devices, tester and pass/fail evidence. Any critical auth, authorization, moderation or voice failure blocks launch.

| Area | Required acceptance |
| --- | --- |
| Registration | Verify 18+ rejection, new email registration, actual production-provider verification link, expired/used link handling and no username/email leakage in public responses. |
| Login/recovery | Wrong credentials fail safely; login persists refresh; logout stops refresh; recovery mail reaches the right account; reset invalidates old password; background polling cannot undo logout/reset navigation. |
| Profile | Complete onboarding, choose a unique username, edit games/platforms/interests; verify private/member/public visibility and permitted avatars from all accounts. Invalid/oversized images and direct Storage uploads fail. |
| Membership | Join/leave/invite; private community/channel denial through direct URL, REST/RPC and Realtime subscription; revoke membership during an active session. Owner transfer must precede deletion. |
| Channel chat | Exchange real messages across accounts; history/replies/threads/reactions/edit/delete; search only authorized content; fetch older pages; offline/reconnect/retry without duplicate committed messages. |
| Attachments | Photos/GIFs/files/MP4 only under validation rules; invalid types/size rejected. Unrelated accounts cannot fetch bytes. Deleted-content media is unavailable to members; retained evidence is staff-only until expiry. No public bucket URLs. |
| Voice | On **two real devices/accounts**, allow microphones, hear two-way live audio, mute/unmute, deafen, change devices, navigate while connected, leave and reconnect. Deny microphone permission; test browser autoplay recovery, headset switching and mobile Safari/Android Chrome. |
| Voice moderation | Moderator removal actually disconnects media and blocks rejoin; disable/lock/archive or revoke/ban while connected. Stop the enforcement worker in staging: new admissions fail closed. Restart/recover; verify participant limits and unrelated token denial. |
| Friends/blocks | Request/accept/decline/cancel/remove; discoverability/presence defaults; block both ways removes contact and prevents invitations, discovery, DM reads/writes and contact restoration without consent. |
| DMs | Only participants read messages/history; unrelated private topics fail; opt-in rules, mute/read counts, reports, reconnect and stale sessions obey current permission. No email directory. |
| Squad Up | Concurrent joins cannot overbook; duplicates do not reserve twice; host approval, cancellation/expiry, private/friends audiences and isolated voice-token access all work. |
| Social | Text/photos/clips/links/comments/reactions/follows; audience isolation, safe previews, own/moderator actions and private-media denial. Link previews must refuse loopback/private/redirect unsafe destinations. |
| Faith/events | Private prayer author/moderator isolation, encouragement and role-loss revocation; timezone/DST events, RSVP, host-only updates/cancel, hidden events stay hidden. |
| Notifications | Private ID-only invalidations, opt-outs, blocked actors, invitation eligibility, deduped opted-in event reminders; private prayer contents never appear in a notification. |
| Administration | Standard member denied direct commands; community scopes isolated; platform roles separate; no self/peer escalation; reported DM only platform staff; audited reasons, evidence expiry, appeals and staff revocation are enforced. |
| Deletion | Reauthenticate; block community/platform owner deletion before file cleanup; transfer then delete ordinary account; shared text tombstones, private records/avatars disappear, evidence holds/audits follow retention. Confirm stale-token denial. |
| Accessibility | Keyboard-only navigation, focus return/trapping, clear labels/errors, screen reader headings, contrast, zoom/reflow and mobile touch targets. Review long messages, empty/error/loading states and poor connectivity. |
| Operations | Canonical origin, correct Production commit, private authenticated health all true, actual SMTP delivery, cleanup/reminder completion, alert receipt, backup/storage hash checks and an isolated recovery drill. |

Automated tests use real local PostgreSQL/Auth/REST/Storage/Realtime/LiveKit with loopback-only fixture guards. Browser media uses a synthetic microphone tone through real encoded WebRTC and decoded remote audio energy; it verifies transport but does not substitute for physical-device/OS permissions or hosted-network/TURN acceptance. Automated axe checks cover common desktop/mobile routes, not every screen-reader interaction or dynamic staff state. Use the manual checks above to close those gaps.

The PR verification workflow covers unit/static/build/dependency/secret-pattern checks. Local integration commands are listed in README. Hosted tests, mail delivery, real-device audio, provider backup restore and real on-call alert delivery are **not automatically approved by a green local build**. Keep completed evidence and unresolved failures in the launch report; do not check boxes without observing the result.
