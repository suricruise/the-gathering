# The Gathering installable app

The site is now prepared as an installable Progressive Web App (PWA), using Next.js's current App Router manifest support and a small first-party service worker. It uses the existing Supabase identity, permissions, private media routes and LiveKit audio. It does not create a second account database or simulate native voice/notifications.

## Member installation

Open the canonical website and choose **Install app** on Home or the welcome page, or **Settings → Install The Gathering**. The public `/install` page provides the native installation button when the browser offers it and manual instructions otherwise.

- **Windows / macOS, Chrome or Edge:** click the address-bar install icon or the app installation option in the browser menu. Confirm the installation and launch it from your desktop, app launcher or taskbar.
- **macOS Safari:** on supported macOS/Safari versions, use **File → Add to Dock**.
- **Android Chrome:** use the site's install button when offered, or Chrome's **Install app / Add to Home screen** menu.
- **iPhone / iPad:** open the site in Safari, choose **Share → Add to Home Screen**, keep **Open as Web App** enabled if offered and confirm **Add**.

Menu labels depend on the browser/OS. Embedded social/in-app browsers may not offer installation; open the canonical site in the regular browser. An install button cannot force a platform to support installation or determine whether the app is installed elsewhere. The app reports installation only from the browser's actual installed/display-mode signals. A dismissed prompt is not shown as success. Some installed contexts need you to sign in again.

## Brand assets

The first-party mark uses the existing lowercase g/star identity, deep navy, purple/lavender gradient and a cyan star. Reproducible source is `scripts/pwa/icon.svg`.

| Asset | Path | Use |
| --- | --- | --- |
| 192px and 512px PNG | `public/icons/icon-192.png`, `icon-512.png` | Android/desktop install icons |
| Full-background 512px PNG | `public/icons/maskable-512.png` | OS icon masks |
| 180px PNG | `public/icons/apple-touch-icon.png` | Apple home screen |
| SVG | `public/favicon.svg` | Browser identity |
| Portrait launch artwork | `public/icons/launch-*.png` | Specified common iPhone/iPad media profiles |
| Actual public welcome screenshots | `public/screenshots/desktop.png`, `mobile.png` | Rich install UI, 1280×800 and 390×844 |

Platforms generate their own install splash where supported. Apple launch assets cover the listed portrait device profiles; other devices/orientations use platform fallback behavior. Physical-device launch rendering must be checked. Screenshots contain only the public welcome page, never member data or invented social activity.

Run `npm run pwa:assets` to rebuild icons/launch images and the worker. Production `prebuild` does this automatically without network access. `node scripts/capture-pwa-screenshots.mjs` refreshes screenshots from a local production preview on port 4173 using Playwright; it is a maintainer tool, not a Vercel build requirement. Keep generated assets committed. Artwork uses system text rendering for launch captions; regenerate/review it in the intended build environment if fonts change.

## Offline and privacy boundary

The service worker precaches exactly eight public resources: the generic offline HTML, its CSS/JS, four branding PNGs and the SVG favicon. It requests these without cookies and refuses unsuccessful/redirected responses. It never caches member HTML, Auth callbacks, RSC responses, API data, channel/DM histories, profile records, uploads, private attachments or signed media links. It does not intercept POSTs, external provider requests or WebSocket/WebRTC connections. It does not implement an offline outbox or background sync.

Member navigations remain network-first/no-store. A network exception produces the static reconnect screen; a real server error remains a server error. The offline screen contains no account-specific details and its Retry button reloads the intended URL, where normal Auth/permissions apply again. Already open views may retain previously rendered information in memory as before; this worker adds no private offline persistence. Use normal account/device security on shared devices.

Public worker/manifest/offline routes bypass Auth-cookie refresh. The worker is served with `Cache-Control: no-store`, an explicit JavaScript content type and root scope. The offline document has a restrictive first-party-only CSP. Other private response and upload protections are unchanged.

## Updates and active voice

A content hash over application/branding source versions each worker build. A new worker waits rather than calling `skipWaiting` automatically. The app shows **Prepare update**, then **Reload app** after activation. Reload is an explicit user action; an update never automatically reloads an active voice room. Leave voice and save forms before reloading. Other open tabs can see the prepared update and choose when to reload. The old code can remain in an already-open tab until it reloads.

Successful activation deletes only obsolete caches with the app's `gathering-pwa-` prefix; unrelated caches remain untouched. The app checks for worker updates on foreground/online events, throttled to once per minute, and unregisters its listeners on unmount. Development mode does not register this worker. Use a production preview for PWA tests.

## Deployment checklist

1. Review/approve publication and deployment under the existing production-change policy. There are **no new database migrations, environment variables or secrets** for the PWA.
2. Build/deploy with the existing Next.js preset on Vercel, Node 24. Keep the canonical HTTPS `APP_URL` and existing Supabase Auth callback URLs. Do not add static-export rewrites or `dist` output settings.
3. Verify `/install`, `/manifest.webmanifest`, `/sw.js`, icons/screenshots and `/offline.html` on the exact production domain. The worker must be first-party JavaScript, root-scoped and uncached by a CDN; public asset responses must not set Auth cookies.
4. In Chromium DevTools, check **Application → Manifest / Service Workers / Cache Storage**. Manifest validation should succeed and Cache Storage should contain only the eight allowlisted files. Application installability checks are separate from app-store submission.
5. Perform the physical-device acceptance below, including one actual install on every supported platform. Browser emulation is not evidence that an OS installation, Apple launch image, background microphone or mobile push delivery works.
6. Use the normal health/monitoring and launch readiness procedures. The PWA does not close previous public-launch gates such as credential rotation, hosted SMTP, backups or physical voice acceptance.

### Required physical-device acceptance

- Install from Chrome/Edge on desktop, Android Chrome and iPhone/iPad Safari; launch from the installed icon and verify its branding, standalone display and correct canonical origin.
- Sign in, register/verify and recover an account with real mail. Check persistent sessions, logout and account isolation in the installed context. Test external auth/reset links returning to the intended origin.
- Upload an image, exchange private/channel messages between accounts, and verify private communities/media remain denied to outsiders.
- Join voice from two separate installed devices/accounts. Test microphone permission denial/grant, mute/deafen, device selection, speaker/autoplay recovery, reconnect, route navigation and moderator removal.
- Test locking/switching apps and incoming audio. Background audio/microphone suspension varies by OS/browser; keep the app open for reliable voice. Do not advertise always-on background voice without actual device evidence.
- Disconnect the network and navigate/relaunch: only the generic reconnect screen appears. Confirm there is no cached member conversation or queued send. Reconnect and retry, with authorization rechecked.
- Leave one installed version open, release an approved update and verify the waiting/manual-reload controls. Test multiple tabs and an active voice room; no automatic reload should occur.
- Check keyboard/focus, screen reader labels, text scaling, touch controls, mobile rotation and OS-specific safe areas/status bars.

## Boundaries and recovery

This release provides installable web apps, not `.exe`/`.dmg` installers or App Store/Google Play packages. Push notifications remain disabled; no notification permission is requested and no VAPID secrets are needed. Existing in-app notifications work while using the site. OS installation/update menus and background behavior remain platform-controlled.

Application rollback can keep the network-only privacy boundary and restore a prior verified worker/assets. If a worker must be retired, deploy a reviewed replacement at `/sw.js` that unregisters itself and deletes only this app's cache prefix, then verify installed clients update. Removing the script alone does not reliably unregister existing installations. Do not clear unrelated site storage, revoke all Auth sessions or erase user content as a PWA rollback shortcut. Users can also uninstall the PWA or remove its service-worker registration in browser site settings.

Automated results are recorded in `DEVELOPMENT_LOG.md`. Local installability checks and browser tests do not certify hosted/physical-device acceptance.
