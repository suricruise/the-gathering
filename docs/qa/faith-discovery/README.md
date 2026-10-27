# Faith Circles discovery visual evidence

Actual local authenticated Chromium captures using the optimized production build:

- [Desktop 1440](desktop-faith-discovery.png)
- [Tablet 1024](desktop-faith-discovery-1024.png)
- [Mobile 390](mobile-faith-discovery.png)
- [Narrow mobile 320](mobile-faith-discovery-320.png)

All content comes from persisted, isolated test fixtures. Parallel tests may briefly expose each other’s public fixture Circles, as normal public discovery allows; private Circles remain excluded for outsiders. Images and session counts are real fixture fields, not production statistics. Fixed mobile navigation may appear partway down a full-page capture; it stays attached to the viewport during actual browsing.

The final discovery scenarios passed desktop/mobile membership, curation, progress, topic/filter/deep-link, image loading and horizontal-overflow checks. Targeted homepage axe WCAG A/AA checks reported no violations. These captures were visually inspected; no pixel-baseline comparison, physical device or Safari test is implied. Reproduce with `e2e/faith-discovery.spec.ts` on the verified local test stack only.
