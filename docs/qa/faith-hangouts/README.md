# Live Study Hangouts — local visual and audio QA

- [Desktop live room](desktop-live-study.png)
- [Mobile live room](mobile-live-study.png)

Captures use isolated local, authenticated fixture accounts and an actual local LiveKit connection. They are not production members or occupancy statistics. Chromium uses a deterministic WAV microphone input so the tests can measure decoded audio at both receivers. The mobile view is 390×844 emulation, not an iPhone/Safari hardware test.

`e2e/faith-hangouts.spec.ts` exercises publication, selected/excluded members, bidirectional audio, mic/deafen/leave/rejoin, Scripture SPA continuity, host removal, end, calendar redirect, discovery and future-event cancellation. Targeted WCAG A/AA axe and document-overflow checks run on the live-room view. Existing voice, Circle, study-room, Hangouts and Spaces browser regressions are also run on desktop/mobile. Exact final results are in `DEVELOPMENT_LOG.md`.

No visual baseline was replaced. The reference imagery is the existing Premium Digital Lounge theme; no third-party artwork is copied. Physical devices, real microphone prompts, Safari/iOS background behavior, hosted credentials/worker health and production load remain manual acceptance checks.
