# Faith Circles prayer — local browser captures

Captured from the production build with two authenticated synthetic local members. These are test fixtures, not real production requests or member activity.

- [Desktop Circle prayer and supportive comments](desktop-circle-prayer.png)
- [Mobile Circle prayer and supportive comments](mobile-circle-prayer.png)

The detail shown is explicitly Circle-visible in the test. Author-only requests were verified inaccessible to the other authenticated account, including returned server HTML. Both viewport runs exercised sharing with approved leaders, comments/edits, I Prayed, updates/testimony, muting, answered status, access revocation, deletion and real two-account threaded chat.

The mobile full-page image includes the existing fixed voice/navigation panel at its viewport position. Actual controls were clicked during the test; full-page stitching is not a physical-device keyboard test. Targeted WCAG A/AA scans and horizontal-overflow checks passed for the tested prayer detail. See [implementation and limits](../../FAITH_CIRCLES_DISCUSSION_PRAYER.md) and the development log for executed results.
