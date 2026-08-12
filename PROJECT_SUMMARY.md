# Master It — Project Summary

"Master It" is a learning-plan app: a user describes a goal, an AI-generated
plan breaks it into scheduled steps, and the user tracks progress. Expo React
Native frontend, Laravel backend, Supabase-hosted Postgres, Anthropic Claude
for plan generation.

## Stack

- **Frontend**: Expo (React Native + TypeScript) at the repo root. React
  Navigation (bottom tabs, one native stack per tab), TanStack Query with an
  AsyncStorage persister for offline reads, Axios, `expo-secure-store` for the
  auth token.
- **Backend**: Laravel 13 in `backend/`, Sanctum personal-access-token auth
  (bearer token, not cookie/SPA auth).
- **Subscriptions**: RevenueCat — `react-native-purchases` in the app, the
  REST API plus a webhook on the backend.
- **Database**: Supabase Postgres, accessed via the **session pooler**
  (`aws-0-us-east-2.pooler.supabase.com`) — the direct-connection host is
  IPv6-only and unreachable from this dev machine.
- **AI**: Anthropic Claude (`claude-sonnet-5`) generates each plan's steps.

## What the app does

Three tabs, each with its own navigation stack (`src/navigation/RootNavigator.tsx`):

- **Today** — the user's own plans. Today's steps across every active plan,
  through to All Plans, Plan Detail (the step checklist), and Step Detail.
- **Explore** — admin-curated featured plans, plus the read-only preview a
  share link opens.
- **Me** — account details and settings.

### Plan generation
`POST /api/v1/plans` records the goal, skill level, time commitment and target
length, then queues `GeneratePlanSteps`, which asks Claude for an ordered set
of steps via tool use. The app polls the plan on the Generating screen until
it leaves `generating`.

- The step *count* is decided server-side from the plan's length and time
  commitment (`stepBudget()`), not left to the model.
- The instructions and worked examples are a **cached** system block; only the
  per-plan specifics go in the user message.
- Claude can call `flag_unsupported_goal` instead, which lands the plan in
  `rejected` with its own screen rather than a generic failure.
- A failed job leaves the plan `failed` with a retry that doesn't re-charge
  the user's allowance (`PlanController::retry`).

### Steps
Each step carries a description, an estimated duration, and a due date
accumulated from the plan's start. Steps can be checked off from either Today
or Plan Detail (`useToggleStep`, shared so the two can't drift). Finishing the
last one triggers `PlanCompleteOverlay` and its feedback prompt.

Opening a step for the first time lazily searches for supporting resources
(`ResourceSearchService`) and, for the ≤2 steps per plan the model marks as
benefiting from one, a YouTube video (`YouTubeVideoSearchService`). Copies of
a featured plan reuse the original's resources rather than each paying for
their own search.

### Refinement
`POST /plans/{plan}/refine` re-runs generation with the existing steps as a
baseline plus tags/notes describing what to change. A refinement that fails or
gets flagged leaves the original plan untouched.

### Sharing and copying
Owners can mint a 30-day share token; the link resolves through the backend's
one public web page, which deep-links into the app or falls back to the store.
Anyone signed in can copy a featured or shared plan into their own plans.
Copying is unlimited on every tier — it never touches the LLM.

### Subscriptions
Tiers live in `config/subscriptions.php` and cap **monthly AI generations**
(free: 0, plus a one-time lifetime generation; starter: 10; pro: 25). There is
no cap on how many plans an account may hold. Purchases go through RevenueCat;
entitlements reach the backend both by webhook (durable) and by an
authenticated refresh endpoint that asks RevenueCat directly rather than
trusting the client (`SubscriptionSyncService` is the only writer).

### Cross-cutting
Light/dark theming with a shared token set (`src/theme/`), a small shared UI
kit (`src/components/ui/`), offline-aware reads via a persisted query cache
with edits blocked while offline, and password reset over a `masterit://`
deep link.

## Local dev setup

- **Backend**: `cd backend && php artisan serve`, plus a queue worker
  (`php artisan queue:work`) — plan generation runs as a queued job, so
  nothing generates without a worker running. A macOS LaunchAgent
  (`~/Library/LaunchAgents/com.masterit.queueworker.plist`) keeps the worker
  running persistently and auto-restarts it if it dies.
- **Frontend**: `npx expo start` (or the `.claude/launch.json` "expo-web"
  config for browser preview). Needs `EXPO_PUBLIC_API_URL` pointed at the
  backend.
- **Required secrets** (local-only, in `backend/.env`, gitignored):
  Supabase DB credentials, `ANTHROPIC_API_KEY`.
- **Pre-commit hook**: `.githooks/pre-commit` runs `pint --test` on staged PHP
  files, so a style violation fails locally instead of failing CI before the
  backend tests get to run. `npm install` enables it (the root `prepare`
  script sets `core.hooksPath`); by hand it's
  `git config core.hooksPath .githooks`. It no-ops when `backend/vendor` isn't
  installed, and `git commit --no-verify` skips it.

## Environments (dev / staging / production)

- **dev**: local only, as described above. Backed by a Supabase project
  (`aws-0-ca-central-1`) that is **also used by staging** — a deliberate
  deviation from full isolation, so a destructive local action (e.g.
  `migrate:fresh`, a bad test run) can affect staging data.
- **staging**: Railway environment tracking the `main` branch. Shares dev's
  Supabase project (see above). Vars documented in
  `backend/.env.staging.example` (real values live in Railway's dashboard,
  never in the repo).
- **production**: Railway environment tracking a `production` branch.
  Promoted deliberately by merging `main` → `production` via PR once
  staging looks good. Backed by its own, fully isolated Supabase project
  (`aws-0-us-east-2`) — no local or staging action can touch it. Vars
  documented in `backend/.env.production.example`.

Each Railway environment runs two services from `backend/` (root
directory): `api` and `worker`. Both were nontrivial to get stable on
Railway — worth reading before touching either again:

- **`api` start command**:
  `php artisan config:cache && php artisan migrate --force && frankenphp run --config /Caddyfile`.
  Do **not** use `php artisan serve` here — it's Laravel's dev-only server
  (single-threaded, no supervision) and was intermittently dying under
  Railway's healthchecks. Railway's Nixpacks builder already generates a
  correct `/Caddyfile` for this app on top of the `dunglas/frankenphp`
  image; use it instead of hand-written serve flags.
- **`worker` start command**:
  `php artisan config:clear && php artisan queue:work --tries=3 --max-time=3600`.
  The `config:clear` guards against a stale `bootstrap/cache/config.php`
  baked in at build time silently overriding a Railway variable you just
  fixed — cheap insurance, though in practice our worker crash-loop turned
  out to be caused by something else (below).
- **Explicit `PORT` variable**: Railway's public-domain routing (the
  "target port" in Settings → Networking) can drift out of sync with
  whatever port the app actually binds to, especially after changing the
  start command. If health checks pass internally but the public domain
  502s with `x-railway-fallback: true`, set `PORT` explicitly as a
  variable on the service to match the Networking target port rather than
  relying on auto-detection.
- **Supabase pooler port matters**: use the **session pooler, port 5432**,
  not the transaction pooler on **6543**. Transaction-mode pooling doesn't
  support PDO's prepared-statement caching correctly and produces
  `SQLSTATE[26000]: prepared statement "pdo_stmt_..." does not exist`
  errors under normal use — this is what actually broke `worker`, not the
  config-cache issue above.
- **Logging**: set `LOG_CHANNEL=stderr` in Railway (unlike local dev's
  `stack`/`single`, which writes to a file inside the container that
  Railway's log viewer never sees). Without it, a `500` just shows
  `{"message":"Server Error"}` with no way to see why.

The mobile app is built per environment via `app.config.ts` + `eas.json`
build profiles (`development` / `staging` / `production`), each with a
distinct bundle identifier (`com.masterit.app.dev` / `.staging` / unsuffixed)
so all three can be installed side by side on one device, and each pointed
at that environment's `EXPO_PUBLIC_API_URL`.

## Known gaps

Tracked in `UX_AUDIT_REMAINING.md`, which is the live list. The two worth
knowing before touching related code:

- **Refinement resets progress.** `GeneratePlanSteps` replaces every step on a
  successful refinement, so `completed_at` is lost. The modal warns about it;
  the behavior is unchanged.
- **The legal documents don't exist.** `src/lib/legal.ts` points at `/privacy`
  and `/terms` on the API host, which the backend does not serve. They have to
  be written and hosted before submission.
