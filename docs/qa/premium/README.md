# Premium redesign visual QA

Captured October 26, 2026 from the local production build using authenticated, explicitly labelled QA fixtures. These are not production member data or production metrics. The administrator views use a real locally authorized staff account.

Viewport JPEGs are compressed at quality 75 for review. Desktop: 1440 × 1000; tablet: 1024 × 1000; mobile: 390 × 844. Loading/error/offline frames use actual delayed/failed/offline browser network requests, not fabricated successful service data.

| Page | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Home | [1440px](1440-home.jpg) | [1024px](1024-home.jpg) | [390px](390-home.jpg) |
| Explore | [1440px](1440-explore.jpg) | [1024px](1024-explore.jpg) | [390px](390-explore.jpg) |
| Community overview | [1440px](1440-community.jpg) | [1024px](1024-community.jpg) | [390px](390-community.jpg) |
| Community text chat | [1440px](1440-chat.jpg) | [1024px](1024-chat.jpg) | [390px](390-chat.jpg) |
| Hangouts | [1440px](1440-hangouts.jpg) | [1024px](1024-hangouts.jpg) | [390px](390-hangouts.jpg) |
| Voice room | [1440px](1440-voice-room.jpg) | [1024px](1024-voice-room.jpg) | [390px](390-voice-room.jpg) |
| Member profile | [1440px](1440-profile.jpg) | [1024px](1024-profile.jpg) | [390px](390-profile.jpg) |
| Profile editing | [1440px](1440-profile-editor.jpg) | [1024px](1024-profile-editor.jpg) | [390px](390-profile-editor.jpg) |
| People discovery | [1440px](1440-people.jpg) | [1024px](1024-people.jpg) | [390px](390-people.jpg) |
| Conversations | [1440px](1440-messages.jpg) | [1024px](1024-messages.jpg) | [390px](390-messages.jpg) |
| Events | [1440px](1440-events.jpg) | [1024px](1024-events.jpg) | [390px](390-events.jpg) |
| Event detail | [1440px](1440-event.jpg) | [1024px](1024-event.jpg) | [390px](390-event.jpg) |
| Notifications | [1440px](1440-notifications.jpg) | [1024px](1024-notifications.jpg) | [390px](390-notifications.jpg) |
| Settings | [1440px](1440-settings.jpg) | [1024px](1024-settings.jpg) | [390px](390-settings.jpg) |
| Administrator overview | [1440px](1440-admin.jpg) | [1024px](1024-admin.jpg) | [390px](390-admin.jpg) |
| Faith & Life | [1440px](1440-faith.jpg) | [1024px](1024-faith.jpg) | [390px](390-faith.jpg) |
| Social feed | [1440px](1440-social.jpg) | [1024px](1024-social.jpg) | [390px](390-social.jpg) |
| Squad Up | [1440px](1440-squad-up.jpg) | [1024px](1024-squad-up.jpg) | [390px](390-squad-up.jpg) |

Network-state captures: [desktop loading](1440-loading.jpg), [mobile loading](390-loading.jpg), [desktop error](1440-error.jpg), [mobile error](390-error.jpg), [desktop offline](1440-offline.jpg), [mobile offline](390-offline.jpg).

Measurements: [desktop/tablet navigation observations](desktop-tablet-timings.json), [mobile observations](mobile-timings.json), [5,000-message local query probe](query-performance.json). Navigation timings measure this local run; total timings also include axe and screenshot work and are not page-transition benchmarks.

See [the completion report](../../../PREMIUM_REDESIGN_COMPLETION.md) for exact executed test results, corrections and manual acceptance limits.

[Sanitized verification registry](verification.json) records distinct passing browser coverage and all local service command results.
