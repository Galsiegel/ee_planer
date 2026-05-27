# SAP Data Sync

## Source
Live course data: `https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/gh-pages/`

Files follow the pattern: `courses_{year}_{semester}.json`
- Semester codes: 200 = winter, 201 = spring, 202 = summer

## In-App Fetching
`src/services/sapApi.ts` fetches the JSON at runtime (not bundled). Results are cached in a module-level `Map`. Do not add persistent caching (IndexedDB, localStorage) without discussing cache invalidation.

## Prerequisite Parsing
SAP data encodes prerequisites in Hebrew: split on `" או "` (OR), then extract 8-digit IDs within each group (AND). The parsing function is `parsePrerequisites` in `sapApi.ts`. Do not change this without verifying against real SAP data.

## General Requirements Sync Script
`scripts/sync-general-requirements.mjs` fetches from Technion UG portal and writes to `src/data/generalRequirements/`. Run via `npm run sync:general-requirements` or automatically as part of `npm run build`.

## Do Not
- Do not hardcode course lists that come from SAP — they change each semester.
- Do not change the BASE_URL without updating the allowed domains in `.claude/settings.local.json`.

## Removed (cleanup branch)
Dead code and offline pipeline artifacts not used by the app build:

| Removed | Reason |
|---------|--------|
| `src/constants.ts` | Empty deprecated `TRACK_SPECIALIZATIONS`; superseded by `src/domain/specializations/` |
| `src/data/specializations/ee_specializations.ts` | Empty legacy stub; specializations load from `files/קבוצות התמחות/*.json` |
| `src/components/DegreeCompletionPanel.tsx` | Never imported; UI lives in `DegreeCompletionModal.tsx` |
| `useGeneralRequirements()` hook | Unused; `usePlan` calls `buildGeneralRequirementsProgress` directly |
| `isShareRoute()` in `shareRouting.ts` | Unused; `Root.tsx` uses `parseShareHash` only |
| `functions/src/services/planValidation.ts` | Duplicate of `functions/src/security/planValidation.ts` (routes use security module) |
| `files/*.py`, `pinecone_*`, `tracks_clean_v*.json`, `courses_strict_v6.json`, `processed_sections*` | Azure/Pinecone catalog pipeline outputs; not imported by Vite or scripts |

Runtime specialization data remains under `files/קבוצות התמחות/<track>/`.
