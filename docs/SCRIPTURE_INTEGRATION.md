# Scripture integration — Faith Circles Phase 8

## Provider decision and official evidence

YouVersion is the selected provider because the project owner confirmed approved YouVersion access on October 27, 2026. No YouVersion/API.Bible credential or approved translation list was present in the inspected environment. Approval of a developer project is not assumed to license every translation, territory or distribution format.

The environment returned proxy **403 Forbidden** for `https://developers.youversion.com/`, `/docs`, `https://docs.api.bible/` and `https://scripture.api.bible/`. Current website terms could not be reviewed. API.Bible remains an unselected alternative; no claim about its current free tiers, available translations or licensing is made.

Current official YouVersion material was accessible through its published npm artifacts:

- [`@youversion/platform-core` 2.16.0](https://www.npmjs.com/package/@youversion/platform-core/v/2.16.0), published from the [YouVersion organization](https://github.com/youversion/platform-sdk-react/tree/main/packages/core).
- Official package README and `client`, `bible`, `schemas/version`, `schemas/passage`, and `bible-passage-display` declarations/implementations. The README explicitly documents server/Node use, version allowlists, `getPassage(..., 'text')`, fresh attribution, and separates the Apache SDK license from translation rights on [YouVersion Platform](https://platform.youversion.com/).
- The documented SDK request contract uses `https://api.youversion.com/v1/bibles/{versionId}`, `/passages/{USFM}`, `format=text`, `include_headings`, `include_notes`, and `X-YVP-App-Key`. Attribution prefers nonempty copyright, then promotional content. These were inspected in the official package; no Bible website was scraped and no live copyrighted passage was downloaded.
- The official React UI 2.16.0 README was also inspected for its explicit permitted-version controls. It does not establish this application's translation license.

The app uses a small server-only REST adapter for that verified contract, preserving existing dependencies. The SDK's optional DOM peer requirement conflicts with the application's current test DOM version; no dependency override or second client/Auth provider is introduced. A clean `npm ci --ignore-scripts` against the unchanged dependency lock succeeded after removing the exploratory SDK installation.

## Functional reference reader

Open **Faith Circles → Scripture reader**, or **Read Scripture references** inside a joined Circle. Released study sessions include the same reusable reader and **Open Scripture workspace**. The workspace reauthorizes the exact Circle/study/session, including release dates, on the server. Provider requests with study context recheck that relationship as well.

- Book/chapter selectors and previous/next navigation use factual metadata for a conventional 66-book catalogue. English full names and a few common aliases normalize to stable references. This is not a claim to cover every canon, language, versification or translation-specific chapter count.
- Passage navigation supports one chapter or a same-chapter verse range. Syntax/known chapter bounds and broad verse safety bounds are checked; exact verse existence is ultimately checked by the authorized provider. Cross-chapter ranges and additional canons are future work.
- References can be copied and bookmarked privately. Bookmarks save no Bible text, Circle names, study/session IDs, answers, prayer content or provider credentials. They persist across refresh, paginate, can be deleted and are removed on Auth account deletion.
- Existing session discussion opens the existing authorized chat/root thread. Browsing a different chapter never silently changes a published session or posts the selected reference. General Circle links open only a currently permitted channel; share a copied reference explicitly if desired.
- Without provider configuration the translation control stays disabled with an explanation. The **YouVersion Bible reader** link opens its public reader homepage; copy the reference to find it there. No unverified passage deep-link is invented. Remote website availability was not verified in this environment.
- Daily Faith & Life content still rotates deterministic reading references. Legacy bundled KJV excerpts and the unsupported global public-domain label were removed; rights vary by territory and were not established here.

## Enable authorized YouVersion text

Only an operator with the approved project's actual permissions should configure these **server-only** environment variables:

```dotenv
SCRIPTURE_PROVIDER=youversion
YOUVERSION_APP_KEY=<approved project application key>
YOUVERSION_VERSION_IDS=<comma-separated approved numeric version IDs>
YOUVERSION_RIGHTS_CONFIRMED=true
YOUVERSION_PLAIN_TEXT_DISPLAY_CONFIRMED=true
```

Keep the flags false until the project's actual license permits this application, deployment territories, on-demand **plain-text** display and the displayed attribution. Obtain IDs from the approved project; do not copy example IDs or assume the SDK license grants Bible content rights. Project credentials alone do not activate this integration. Up to ten explicitly allowed IDs are supported. No key is sent to a browser, URL, log or voice worker; there is no YouVersion account login or token storage in the application.

Apply the separately reviewed Phase 8 database update and deploy only after approval. Open the reader, choose **Load approved translations**, then **Read approved passage**. Names come from current provider metadata, never hardcoded or guessed. Every passage request checks the allowlist, book availability and fresh attribution before rendering. The provider's validated HTTPS translation-source URL is displayed; it is not falsely described as an exact passage link.

HTML-only attribution, absent copyright/promotional attribution, unsafe source URLs, unsupported books, malformed/oversized responses, denied keys and provider outages fail closed. No alternative text is substituted. If the project's license requires HTML layouts/fonts, a logo, additional attribution or geographical enforcement not provided here, keep text disabled until those requirements are implemented and reviewed. This version intentionally supports approved plain-text display only.

## Security, retention and performance

`/api/scripture` authenticates verified Supabase identity, applies the existing active/onboarded/adult account gate and a database-backed 60-request/minute per-member admission limit before provider access. Exact optional study scope is checked before upstream requests. Provider paths and host are fixed server-side; redirects are forbidden, responses are bounded to 250 KB and requests time out after eight seconds. Only the approved passage reference/version is sent upstream, never private Circle titles, member identity, prayer/teaching text or study IDs.

No Bible text is persisted, indexed, pushed into notifications, exported, stored in browser storage, queued offline or cached. Upstream fetches and authenticated API responses are explicitly no-store; no new public/cache allowlist is added to the PWA. React renders the approved response as escaped plain text, with current attribution adjacent. Content already delivered to a browser cannot be recalled; new reads always reauthorize. Pending passage requests cancel on reference changes/unmount and stale replies are ignored. The current translation selection is retained during chapter browsing, without repeating status/metadata calls for each chapter. Status loads once per reader/context (or explicit retry), never licensed text; translation/text requests require user action.

Reference bookmarks use additive `202611240001_scripture_references.sql`, owner-only RLS and no browser write grants. A narrowly scoped authenticated RPC derives the actor from Auth, rate-limits writes, serializes per-user changes, prevents duplicates, caps 200 references per user and returns bounded cursor pages without the owner ID. A user/created-time/UUID index supports pagination; account deletion cascades. Account restrictions apply to direct owner reads and RPC reads. These are personal reference bookmarks, separate from the existing private study resume/progress records.

Each translation-list action makes at most one metadata request per allowed version; a passage action makes fresh metadata plus text requests. No bulk Bible download, polling of passage content or full study/history reload occurs. Confirm actual provider quota/usage limits for the approved project before enabling a large audience; this stage is not a provider-scale benchmark.

## Migration, rollback and remaining acceptance

The isolated local database was updated for tests. No hosted SQL or live deployment is part of this task. Verify backup/history through Phase 7 `202611230001`, then, after approval, run only **`supabase/faith-scripture-setup.sql`** or the matching versioned migration. Recorded reruns skip; ambiguous unrecorded objects refuse reset. Do not rerun older phase installers over existing tables. Retain additive bookmarks/RLS on a code rollback; disable text with `SCRIPTURE_PROVIDER=none`. Never drop member records to undo the feature.

Required remaining acceptance: actual project key and allowed translations, project-specific legal/display restrictions, live provider attribution/source verification, hosted worker/storage/DB configuration, physical-device/Safari keyboard/audio behavior and production-scale load. Real provider success is **not** established by synthetic contract tests. See `FAITH_CIRCLES_COMPLETION.md` for exact executed results and outstanding risks.
