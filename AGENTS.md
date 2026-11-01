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
- Food results paginate in batches of 20. Keep USDA's generic-before-branded ordering across pages, reset pagination for new queries, and preserve loaded results when a later page fails. Cache public upstream searches for seven days and details for 180 days; do not invalidate external caches for local food edits.

## Interface conventions

Use the lively green accent `#4ade80`, with `#6ee7a0` for its hover state. Neutral backgrounds, surfaces, borders, and text must be grey, without a green tint. Keep semantic warning/error colors and macro indicators distinct. Theme tokens are in `src/app/globals.css`.

Preserve mobile safe areas, readable form controls, accessible labels, keyboard focus, and explicit save/discard/delete actions. Reuse the shared button, input, and sheet components. Opening food search must not autofocus its input.

Meal logging/editing, food search/details, food creation/editing, and the custom-food library use separate URLs with browser history navigation. Preserve in-memory drafts across Back/Forward; saving or explicitly discarding clears the corresponding draft. Shared tracker layout and workspace draft storage are under `src/app/(tracker)/` and `src/components/drafts.tsx`. Measurement editing stays in a bottom sheet.

With the keyboard closed, only the search results scroll; the search bar and custom-food creation action stay visible. With the keyboard open, size the workflow to the visual viewport and let the entire page scroll so all fields and actions remain reachable. Preserve Android viewport resizing and the visual-viewport fallback. Keep skeletons during debounce and initial loading without flashing empty states, and retain existing results during background refreshes.

When changing app identity or colors, keep the manifest, viewport theme, SVG icon, offline fallback, and PNG icons consistent. Regenerate tracked PNGs with `npx tsx scripts/generate-icons.ts`. The service worker must not cache private API responses or meal data; registration is enabled only in production.

## Authentication and persistence

All personal-data endpoints require `requireAccount()` and account-scoped queries. Use the existing `api`, `json`, `readJson`, and origin-validation helpers. Validate incoming payloads with Zod and calculate nutrition on the server from canonical foods or saved snapshots; do not trust client totals.

Preserve scrypt-hashed login secrets, hashed session tokens, renewable HttpOnly cookies, Secure cookies in production, SameSite protection, persistent login rate limiting, and logout revocation. API responses containing private data must remain `no-store`.

Never commit or print `.env`, `app-login-secret`, database URLs, API keys, session tokens, or request bodies containing credentials. `.env.example` contains placeholders only. Seed scripts must remain idempotent and preserve existing accounts and secrets.

For schema changes, update the Drizzle schema and generate a new migration with `npm run db:generate`. Keep migration metadata consistent and retain `pg_trgm` support. Do not rewrite applied migrations. `npm run db:migrate` applies each migration and its journal entry atomically. Database commands operate on the configured Neon database; preserve personal data and avoid unrelated changes.

## Phone preview through Windows/WSL

Use one Next.js development server on port **3000**, listening on `0.0.0.0` (already set by `npm run dev`). Keep port **3100** for temporary production/Playwright checks; stop any test server you started when finished and leave the phone's dev server running.

The verified LAN setup used computer IP `192.168.1.191`, subnet `192.168.1.0/24`, and a Windows proxy on **3001** forwarding to WSL's **3000**. These addresses are examples from the working setup: check the computer's current LAN IPv4 with `ip -brief addr` or Windows `Get-NetIPAddress -AddressFamily IPv4` before reusing them. The phone must be on the same LAN. Its own `localhost` refers to the phone.

Start the dev server from WSL with the computer's LAN IP allowed:

```sh
DEV_ALLOWED_ORIGINS=192.168.1.191 npm run dev -- --port 3000
```

`next.config.ts` reads comma-separated `DEV_ALLOWED_ORIGINS`. Use hostnames/IPs only, without a scheme or port, and restart the dev server after changing it. This is required even when using a proxy: Next's dev-only resources and HMR WebSocket validate the browser's origin. A blocked `/_next/hmr` connection can leave the app on an endless loading spinner even though the HTML returns HTTP 200.

Inspect existing configuration with `netsh interface portproxy show v4tov4` and `Get-NetFirewallRule -Name Intake-Dev-Proxy-3001-LAN`. Reuse matching configuration. For missing configuration, run the following in **Windows PowerShell as Administrator**, replacing the example IP/subnet as needed:

```powershell
$intakeLanIp = '192.168.1.191'
$intakeLanSubnet = '192.168.1.0/24'

netsh interface portproxy add v4tov4 "listenaddress=$intakeLanIp" listenport=3001 connectaddress=127.0.0.1 connectport=3000 protocol=tcp

New-NetFirewallRule -Name 'Intake-Dev-Proxy-3001-LAN' `
  -DisplayName 'Intake dev proxy 3001 (local network)' `
  -Direction Inbound -Action Allow -Protocol TCP `
  -LocalAddress $intakeLanIp -LocalPort 3001 `
  -RemoteAddress $intakeLanSubnet -Profile Any
```

Keep the firewall exception limited to that port and LAN subnet. Update the proxy and firewall addresses if the computer's LAN IP changes. Windows IP Helper (`iphlpsvc`) must be running for the port proxy. A separate WSL Hyper-V allow rule for port 3000 was insufficient by itself in this workspace; the Windows proxy plus its host firewall rule is the verified path. Windows commands invoked from the WSL sandbox may require tool escalation; `UtilBindVsockAnyPort: socket failed` indicates blocked Windows interop, not an app error.

Open **`http://192.168.1.191:3001`** on the phone, using the current computer IP and explicit `http://`. Verify the sign-in screen or signed-in dashboard actually renders, then test navigation and adding a meal draft. Check the HMR WebSocket through the proxy as well as the HTML response; an unauthenticated `/api/bootstrap` returning 401 is expected. Firefox mobile was verified; Chrome previously showed `ERR_TOO_MANY_RETRIES` while Firefox reached the same proxy, so distinguish browser-specific failures from server failures.

Use dev mode for this HTTP preview: production uses Secure session cookies and enables the service worker. Keep using `src/lib/draft-id.ts` for client draft IDs, since `crypto.randomUUID()` is unavailable on insecure HTTP LAN origins. Previewing the existing app does not require database migrations or seeding.

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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
