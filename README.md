# Intake

Personal, mobile-first meal tracking with dated calorie targets, protein/fat/carbohydrate tracking, and weight-loss estimates. Dark mode only. Installable as a PWA; internet access is required.

Built with Next.js App Router, TypeScript, Drizzle, Neon Postgres, TanStack Query, Tailwind, and shadcn-style Radix components. Formatting uses Prettier; linting uses ESLint.

## Run locally

Use Node.js 22.13+ or 24 LTS and npm.

```sh
npm install
cp .env.example .env
# Fill in the database connection and USDA API key in .env.
# Put your personal access key in app-login-secret (or set APP_LOGIN_SECRET).
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The supplied workspace database has already been migrated and the supplied personal account seeded. The first sign-in opens initial measurements. Enter your real measurements there; no example measurements or meals are seeded into the personal account.

For phone access on the same network, set `DEV_ALLOWED_ORIGINS` to the computer's LAN IP (hostname only, without a scheme or port), then restart `npm run dev`. The dev server listens on all interfaces. Open `http://<computer-ip>:3000` on the phone, or the forwarded port when using a Windows/WSL proxy. The host firewall must allow the chosen port from the local network.

Seeding is idempotent: an existing account and its secret are preserved. Only a scrypt hash is stored. The ignored secret file is used by the seed script, never read by the running app or sent to the browser. A successful login creates a random, server-side session with a one-year HttpOnly cookie, renewed during active use after seven days. Cookies are Secure in production and SameSite=Lax. Signing out revokes the session. Login attempts are limited in Postgres so the limit survives serverless restarts.

## Vercel

1. Import this directory as a Next.js project in Vercel. Use the default install/build commands (`npm install`, `npm run build`) and Node.js 24.
2. Add `NEON_PG_CONNECTION_STRING` and `USDA_FDC_API_KEY` as server environment variables. Do not prefix them with `NEXT_PUBLIC_`.
3. Apply `npm run db:migrate` against the intended database before deploying new schema changes. For a different, empty database, run `npm run db:seed` once with the secret file locally or `APP_LOGIN_SECRET` set in that command's environment. The already initialized database does not need a runtime login-secret variable.
4. Deploy and use its HTTPS address. On Android/Chromium, use the install button when offered or the browser's Install app menu. On iPhone, use Safari → Share → Add to Home Screen.

The app includes a standalone web manifest, regular/maskable PNG icons, Apple metadata, safe-area spacing, and a service worker. The worker does **not** cache private API responses or meals and does not provide offline logging. Use `npm run build && npm start` to verify installation locally; service-worker registration is disabled during `npm run dev`.

Food search uses USDA FoodData Central and saved/custom foods. See [provider notes](docs/food-providers.md) for request limits, configuration, and caching.

## Tracking rules

- Dates always use `Asia/Tashkent`, independent of the phone's timezone. Navigation runs from the initial measurement date through today.
- Each measurement saves its derived targets. Every date uses the latest measurement effective on that date; backdating is supported after onboarding. Changing a target never rewrites old measurement records.
- Maintenance uses Mifflin–St Jeor and an activity multiplier. The default is moderate activity (1.55), representing the stated two weekly strength sessions and one cardio session. Activity remains an estimate and can be updated with measurements.
- Mild, steady, and extreme limits are calculated from weight and estimated maintenance, with conservative intake floors. The steady limit drives the dashboard. Targets are not directly editable.
- Macro targets follow the requested 40% protein, 35% fat, 25% carbs split. Fields consistently use protein, fat, carbs order. Macro values use muted purple for protein, yellow for fat, and green for carbs throughout the dashboard, meals, food details, and food forms. See [nutrition methods and sources](docs/nutrition.md) for formulas and assumptions.
- The chart shows the selected date and its seven preceding dates within the tracking period. Bars grow upward from zero to each day's logged kcal; colors follow that day's calorie thresholds. Tap a bar to view its day.
- The summary uses only the seven full calendar days preceding the selected date. Days at or below their own extreme limit are excluded unless explicitly marked complete. Empty days are excluded unless marked complete. Unmarking a normal day does not exclude it if intake is above its extreme limit.
- Projection uses each included day's historical maintenance, the selected date's latest weight and goal, and a constant-deficit approximation of 7,700 kcal/kg. It is an estimate under that assumption. No target date is shown for zero/surplus intake trends or insufficient data. Reaching the target is supported.
- Meals are drafts until **Save meal**. Discard leaves the saved meal unchanged. Creating a custom food saves it separately even when the meal draft is later discarded.
- Meal logging/editing, food search/details, food creation/editing, and custom foods have separate URLs. Browser/Android Back returns to the preceding screen and keeps drafts in memory; Forward restores them. Drafts clear on save/discard, sign-out, or a full page reload. Saved meals and custom foods can be opened directly and refreshed. Measurements still open in a bottom sheet.
- Food entries store immutable nutrition snapshots. Editing a custom food affects new entries. Editing an existing entry's amount retains its original nutrition. Deleting a custom food archives it; historical meal entries remain intact.
- Food search has three tabs: **Recent** (default), **My foods**, and **Food database**. Recent shows each food's latest dated meal entry once, including its quantity and unit; selecting it prefills that portion. Search on Recent is limited to logged foods. My foods includes all active custom and saved imported foods, including unused custom foods. Food database searches USDA. Tabs and the search text survive Back/Forward navigation.
- The plus button beside a Recent result adds its recorded portion to the current meal draft without leaving search. Each tap adds a new entry; the meal is persisted only with **Save meal**. Quick add preserves the recorded gram weight and falls back to grams if its old serving is unavailable or has changed weight.
- External foods are resolved only when selected and saved locally when a meal is saved. Local search waits 150 ms; USDA search waits 850 ms and runs only on the Food database tab. Duplicate provider results are collapsed, and saved imports are reused when selected. Neon `pg_trgm` supports fuzzy local search. New entries use current food nutrition; an unavailable previous serving falls back to its recorded gram weight.
- Food lists load 20 items at a time as you scroll, with a load-more/retry button available. USDA applies generic-before-branded ordering across all result pages. Search and custom-food pages keep their search bar and creation action visible while only the results scroll. When the keyboard opens, the workflow shrinks to the visible viewport and the entire page scrolls, keeping lower fields and actions reachable.
- Public USDA search pages use a seven-day server cache; details use a 180-day cache. Next.js Data Cache persists upstream responses on Vercel, with bounded in-process caching and coalescing as another layer. Query case/spacing variants share cache entries. Client search/detail caching avoids repeated requests, and local food edits preserve external cache entries. Private app API responses remain `no-store`.

## Checks

```sh
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e
```

Browser tests run the production app on port 3100 and use the configured Neon database. They create separate temporary accounts and remove only their own data afterward. The authentication test signs in and signs out of the personal account without changing its profile or meals. Credentials and session tokens are excluded from browser traces. Install a Chromium Playwright browser if needed with `npx playwright install chromium`.

Generated migrations live in `drizzle/`; `db:migrate` applies each migration and its journal entry atomically. `npm run db:generate` generates later schema migrations. The initial migration includes `pg_trgm` and its food-name index. PWA PNG icons can be regenerated with `npx tsx scripts/generate-icons.ts`.
