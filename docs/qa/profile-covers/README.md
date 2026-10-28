# Profile cover visual checks

- [Default header before](default-header-before.png) / [after](default-header-after.png): isolated browser markup using the repository CSS before and after the full-width fix, not production captures. Width assertions passed at 220, 280 and 320 pixels.
- [Desktop uploaded member card](desktop-member-card.png) and [mobile activity-drawer member card](mobile-member-card.png).
- [Desktop profile/editor](desktop-profile-editor.png) and [mobile profile/editor](mobile-profile-editor.png).

The uploaded-cover images are actual local authenticated Playwright fixtures from `e2e/profile-covers.spec.ts`. A generated solid-purple PNG was uploaded, decoded, re-encoded and served through the private authorized endpoint. These are test members, not production profiles. Screenshots wait for the actual image to decode; the gradient seen in the separate default-header example is the no-upload fallback.

Final browser run: four desktop/mobile cover and existing premium-profile regression cases passed in 46.2 seconds. It verified upload and reload persistence, full-width card bounds, denied raw storage access, private/member visibility, mutual blocks, removal and old-object cleanup. Existing profile editing, discovery, interests and privacy browser checks also passed. Chromium mobile emulation does not replace physical-device photo-library/Safari testing.
