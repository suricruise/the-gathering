# Faith Circles final QA — Scripture reference reader

- [Desktop reader](desktop-scripture-reader.png)
- [Mobile reader](mobile-scripture-reader.png)

Captures are from actual isolated local Auth/database-backed browser sessions. Names/studies are fixtures, not production members or activity. Screenshots show the honest unconfigured-provider reference mode; **no licensed text was fetched or fabricated**. The final mobile viewport is 390×844 and desktop is 1440×1000.

`e2e/scripture.spec.ts` checks factual book/chapter navigation, alias normalization, actual browser clipboard copy, stable private bookmark persistence/deletion, account isolation, unavailable licensed-text responses, private/unreleased/ex-membership denials, real session-to-channel discussion and return navigation. Targeted axe and viewport-width checks run against the reader.

Related QA actually executed existing Circle/discovery/backend, private study responses/progress, prayer, study builder/review, Spaces/notifications, ordinary community/channel management, messaging/attachments, private search/mentions, reconnection, 5,000-message virtualization and real LiveKit audio on desktop/mobile. Exact success/failure/retest counts are in `FAITH_CIRCLES_COMPLETION.md`; no visual baselines were replaced.

Chromium's voice input is a deterministic WAV while Auth, LiveKit signaling, media tracks and decoded remote audio are real. The additional transport-recovery check passes real sockets through to the local server and interrupts signaling; it does not publish fake voice events or participants. Physical-device microphones/keyboards, Safari, hosted configuration and actual licensed YouVersion delivery remain manual acceptance. Full-page captures may show fixed navigation at the current scroll position.
