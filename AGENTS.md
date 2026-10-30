# Project guidance

## Product and scope

Intake is a personal, single-account meal tracker for adult weight loss. It is a mobile-first, dark-only PWA hosted on Vercel, with Neon Postgres for persistence. Installation is supported; offline logging is not.

Read `README.md` for setup and current behavior, `docs/nutrition.md` for calculation methods, and `docs/food-providers.md` for USDA integration details. `prompt.txt` and `reference.txt` contain the original brief; later user decisions and the current implementation supersede outdated parts of those files.

Use English labels, metric units, kcal, and the fixed `Asia/Tashkent` timezone. Keep UI copy short and functional. USDA FoodData Central is the only external food provider; custom foods live in the database.

## Stack and layout

- Next.js App Router, React, TypeScript, and npm. Use Node.js 24 for deployment.
- Drizzle ORM with the Neon HTTP driver; TanStack Query for client server-state management.
- Tailwind and shared shadcn-style Radix primitives; Lucide icons.
- ESLint, Prettier, Vitest, and Playwright. Keep `package-lock.json` synchronized with dependency changes.
- `src/app/api/`: authenticated route handlers; `src/app/`: page shell, metadata, manifest, and global styles.
- `src/components/`: client workflows and shared UI primitives.
- `src/lib/types.ts`: shared domain contracts; `validation.ts`: Zod request schemas.
- `src/lib/repository.ts`: persistence and dashboard assembly; `db/`: schema and lazy database connection.
- `src/lib/nutrition.ts` and `dates.ts`: pure calculation and calendar functions.
- `src/lib/providers/`: server-side USDA normalization, request limits, and caching.
- `drizzle/` and `scripts/`: migrations, account seeding, and PWA icon generation.
- `tests/*.test.ts`: unit tests; `tests/e2e/`: browser and API integration tests.

Keep server credentials, database code, and provider requests behind `server-only` boundaries. Prefer the existing helpers and types over duplicating business logic in components or routes.

## Domain rules to preserve

- Calendar dates use `YYYY-MM-DD`. Use the helpers in `dates.ts`; do not derive tracking dates from the browser's local timezone.
- Navigation and writes are bounded by the initial measurement date and today. Measurements are separate dated records, with targets saved when calculated.
- Historical views use the latest measurement effective on the viewed date. Each historical day's deficit uses that day's own maintenance. A later measurement must not replace earlier targets.
- The steady calorie limit is the main daily target. Calorie limits are derived from measurements, not directly editable. Preserve the researched formulas, intake floors, and exact color boundaries documented in `docs/nutrition.md`.
- Default activity is moderate (1.55). Macro targets are 40% protein, 35% fat, and 25% carbs. Display and input macros in protein, fat, carbs order.
- Summaries consider only the seven full calendar days before the selected date. Include a day when intake is strictly above its extreme limit or the day is explicitly marked complete. Otherwise exclude it, including empty days. The selected day's intake never enters its own summary.
- No positive average deficit means no projected goal date. Support reaching or passing an existing goal, and retain the approximation label on projections.
- Food nutrition is per 100 g. Convert serving quantities using actual gram weights; do not treat volume as mass without a supplied conversion. Preserve precision until display.
- Meals remain client drafts until explicitly saved. Discard must leave the saved meal unchanged. Custom-food creation is a separate save.
- Meal entries contain immutable food nutrition snapshots. Updating an existing entry's amount preserves its original nutrition; new entries use current food data. Preserve entry IDs when editing meals. Archiving a custom food must leave historical entries intact.
- Search local foods first, debounce external searches longer, deduplicate saved USDA foods against external results, and resolve external details before adding entries. Persist imported foods when saving a meal. Preserve caching, request coalescing, and rate-limit handling.

## Interface conventions

Use the lively green accent `#4ade80`, with `#6ee7a0` for its hover state. Neutral backgrounds, surfaces, borders, and text must be grey, without a green tint. Keep semantic warning/error colors and macro indicators distinct. Theme tokens are in `src/app/globals.css`.

Preserve mobile safe areas, readable form controls, accessible labels, keyboard focus, and explicit save/discard/delete actions. Reuse the shared button, input, and sheet components. Opening food search must not autofocus its input.

When changing app identity or colors, keep the manifest, viewport theme, SVG icon, offline fallback, and PNG icons consistent. Regenerate tracked PNGs with `npx tsx scripts/generate-icons.ts`. The service worker must not cache private API responses or meal data; registration is enabled only in production.

## Authentication and persistence

All personal-data endpoints require `requireAccount()` and account-scoped queries. Use the existing `api`, `json`, `readJson`, and origin-validation helpers. Validate incoming payloads with Zod and calculate nutrition on the server from canonical foods or saved snapshots; do not trust client totals.

Preserve scrypt-hashed login secrets, hashed session tokens, renewable HttpOnly cookies, Secure cookies in production, SameSite protection, persistent login rate limiting, and logout revocation. API responses containing private data must remain `no-store`.

Never commit or print `.env`, `app-login-secret`, database URLs, API keys, session tokens, or request bodies containing credentials. `.env.example` contains placeholders only. Seed scripts must remain idempotent and preserve existing accounts and secrets.

For schema changes, update the Drizzle schema and generate a new migration with `npm run db:generate`. Keep migration metadata consistent and retain `pg_trgm` support. Do not rewrite applied migrations. `npm run db:migrate` applies each migration and its journal entry atomically. Database commands operate on the configured Neon database; preserve personal data and avoid unrelated changes.

## Validation and workflow

Run checks appropriate to the change:

```sh
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

For affected browser workflows, run `npm run test:e2e` after building. Playwright uses the production app on port 3100 and the configured Neon database. Tests create isolated temporary accounts and clean up only their own data. The auth test signs in and out of the personal account without changing its meals or profile. Keep credential-bearing traces disabled. When reusing a running server, ensure it serves the current build.

For documentation-only edits, check formatting and `git diff --check`; an app rebuild or database operation is unnecessary. Add meaningful regression coverage for changed calculation, persistence, authentication, or provider behavior. Review responsive screenshots for visual changes rather than adding tests that merely repeat CSS values.

Keep changes scoped and preserve unrelated user edits. When using subagents, give them distinct file ownership and review their shared contracts before integrating changes. Before a requested commit, inspect the staged diff and confirm secrets and generated build/test artifacts remain excluded. Report what changed, the checks completed, and any actual limitations.
