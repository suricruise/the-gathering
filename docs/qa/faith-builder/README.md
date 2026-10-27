# Study Builder local QA

- [Desktop editor](desktop-study-builder-editor.png)
- [Mobile editor](mobile-study-builder-editor.png)
- [Desktop member preview](desktop-study-builder.png)
- [Mobile member preview](mobile-study-builder.png)

Captures contain only isolated local test accounts and a generated solid-color cover, not production members, copyrighted artwork or fabricated production studies. The mobile viewport is Chromium emulation at 390×844; desktop is 1440×1000. The application uses the existing Premium Digital Lounge tokens and shell.

`e2e/faith-builder.spec.ts` exercises real Auth/database/storage/server actions for creating a draft, saving details, uploading a re-encoded image, rejecting SVG and a forged PNG, denying member cover upload/draft reads, editing/duplicating/reordering/reopening sessions, safe preview, scheduled release, actual publication, completion and archival without deleting progress. An independent two-account review case verifies submission lock, reviewer authorization and approved publication. Targeted axe/overflow checks run on the builder view. Existing discovery, Circle membership, reading/private reflections, events and real LiveKit audio regressions run separately.

Final counts are in `DEVELOPMENT_LOG.md`. Layout captures are inspected; no visual baseline is replaced. Full-page screenshots can show fixed navigation at the current scroll position. Physical-device keyboards, Safari, actual microphones and hosted production configuration remain manual acceptance checks.
