# Community message composer — Stage 3

This stage upgrades the existing channel composer; it retains the same messages, replies, IDs, secure file endpoints, Supabase PostgreSQL/private Broadcast and persistent LiveKit provider. It introduces no migration, bucket, environment variable or provider dependency. The earlier channel-workspace/member-directory migrations must already be installed.

## Member controls

- The textarea grows to a bounded height, then scrolls internally. Enter sends; Shift+Enter inserts a newline. Composition/IME confirmation does not send. The visible Send button supports pointer/touch input.
- Choose emoji opens a searchable local Unicode picker with native dialog focus/Escape behavior. Emoji inserts at the saved caret/selection. GIF search is deliberately disabled: no approved/configured provider exists. Uploading an actual GIF file still works through the existing sanitizer.
- Separate file/image pickers and desktop file drops stage up to four files. Existing limits remain: 3 MB each, text/Markdown/CSV at most 512 KB; JPEG/PNG/WebP/GIF/PDF/UTF-8 text only. Client hints never replace server byte validation.
- Upload progress measures actual request bytes. At 100%, processing can continue; only validated successful server metadata enables sending. A failed attachment must be retried or removed. All ready attachments appear by filename; sanitized protected images show previews before sending. No external dropped URLs or HTML are fetched.
- Replies show author and escaped message excerpt with Cancel reply. Cancel returns to the channel and retains the current draft/files. Back to channel has the same effect. This retains the existing thread relationships rather than introducing a parallel reply model.
- Type `@` at a word boundary for a debounced eight-result lookup using the existing authorized channel member directory. Arrow keys move selection; Enter or Tab inserts the username; Escape dismisses. Stale query responses are ignored. The directory retains current membership, private-channel and block checks, and never exposes email.
- Existing safe Markdown/GFM rendering is unchanged. Untrusted HTML is skipped, unsafe links rejected and external Markdown image URLs are not embedded.

## Delivery and privacy contract

A synchronous send guard prevents rapid Enter/tap duplicates. Each logical send captures one immutable UUID, body, reply context and attachment list. An unconfirmed send locks changes and exposes Retry message, which resubmits precisely that operation. The database's existing idempotent command reconciles a committed retry to its original message. A definite rolled-back validation/permission/rate rejection permits correction, unless an earlier attempt was already uncertain. A successful write followed by failed projection remains uncertain. No optimistic fabricated success, automatic reconnect resend or second outbox exists.

Send success is shown only after the server returns a committed message. Failed drafts remain in memory; leaving/reloading can discard drafts or an uncertain operation ID. Keep the page open to resolve uncertain sends. Persistent drafts/offline queues require a separate privacy and recovery design and are not stored in localStorage, IndexedDB or the PWA.

Posting/upload permissions, origin checks, server Auth/RLS, rate limits, content sniffing, ownership checks and private `message-files` storage remain authoritative. Staged image previews use the existing authenticated `/api/chat/attachments/:id` route, which rechecks access and returns no-store content, never a public URL. Removing an attachment/unmounting aborts its in-flight request. Existing staged-file expiry cleans abandoned uploads; no message attachment is deleted as a UI shortcut. Losing channel access unmounts the composer and clears its volatile state.

Changing reply context/search is disabled during an uncertain send. Cancelling a reply invalidates outstanding thread loads so late responses cannot restore obsolete thread paging. Voice remains at the persistent member-layout boundary.

## Verification and manual acceptance

Unit coverage checks Enter/Shift+Enter/IME, synchronous send guards, immutable retry and definite-versus-uncertain failures, emoji insertion, scoped mentions/stale responses, reply cancellation, file validation/progress/retry/abort and disabled posting. Real two-account Playwright coverage exercises multiline/emoji/mentions, cancellation with draft retention, interrupted upload/retry, sanitized preview, native file drop, live delivery and offline retry with one persisted ID on desktop/mobile. Existing database/Realtime tests enforce unauthorized mutations/subscriptions, private attachment ownership and rate limits. Existing workspace and real decoded-audio voice tests protect channel isolation, responsive drawers, keyboard viewport and persistent voice.

Physical iOS/Android keyboards, Safari IME/file pickers, screen readers and slow cellular upload/network transitions still require manual acceptance. A native OS picker can reject a type before the app receives it; server rejection always remains visible when an upload reaches the endpoint. This stage does not expand file formats, add GIF search, virtualize histories or claim production load certification.

Release remains a separate explicit owner-approved push/deployment. Rollback is an application rollback; no Stage 3 database rollback is needed.
