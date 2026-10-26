# Faith Circles visual evidence

Actual local, authenticated test fixtures captured from the optimized production build in Chromium:

- [Desktop landing](desktop-faith-circles-home.png)
- [Desktop Circle](desktop-faith-circle-detail.png)
- [Mobile landing](mobile-faith-circles-home.png)
- [Mobile Circle](mobile-faith-circle-detail.png)

Desktop viewport 1440×1000; mobile emulation 390×844. Full-page captures may show the fixed mobile navigation partway down the image; the controls remain fixed to the viewport while browsing. Circle names, approved leaders, current study references and scheduled events are isolated test fixtures, not seeded production content.

Reproduce with the local stack and `npx playwright test e2e/faith-circles.spec.ts`. This captures real UI and checks horizontal overflow and detail-page accessibility; it does not establish physical-device/Safari compatibility or compare pixel baselines. Never run fixture tests against hosted/production Supabase.
