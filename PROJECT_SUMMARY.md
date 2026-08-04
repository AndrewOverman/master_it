# Master It — Project Summary

"Master It" is a learning-plan app: a user describes a goal, an AI-generated
plan breaks it into scheduled steps, and the user tracks progress. Expo React
Native frontend, Laravel backend, Supabase-hosted Postgres, Anthropic Claude
for plan generation.

## Stack

- **Frontend**: Expo (React Native + TypeScript) at the repo root. React
  Navigation (stack + drawer), TanStack Query, Axios, `expo-secure-store` for
  the auth token.
- **Backend**: Laravel 13 in `backend/`, Sanctum personal-access-token auth
  (bearer token, not cookie/SPA auth).
- **Database**: Supabase Postgres, accessed via the **session pooler**
  (`aws-0-us-east-2.pooler.supabase.com`) — the direct-connection host is
  IPv6-only and unreachable from this dev machine.
- **AI**: Anthropic Claude (`claude-sonnet-5`) generates each plan's steps.

## What's been built, in order

### 1. Initial scaffold
Expo RN app wired to a Laravel + Sanctum backend. Core screens: New Plan →
Generating → Plan Detail, matching a `Plan` / `PlanStep` API contract.
Backend: `PlanController` (create/list/show), `PlanStepController` (toggle
step completion), a queued `GeneratePlanSteps` job, Sanctum token auth
(`/api/v1/register`, `/api/v1/login`, `/api/v1/logout`).

### 2. Login/register screen
Email/password form with a Login ↔ Sign-up toggle. Stores the returned
Sanctum token in `SecureStore`. `RootNavigator` checks for a stored token on
launch and routes to Login or straight into the app accordingly.

### 3. Drawer navigation + Plans list
Hamburger menu (drawer) wrapping the app's stack navigator, styled with
branding and a "Plans" item. New `PlansListScreen` lists all of a user's
plans via `GET /api/v1/plans`; tapping one opens its step checklist.

### 4. Plan duration field
"How long should this plan take?" weeks/days input on the New Plan screen,
combining into `target_days` on the create-plan request. Left blank, the
backend defaults to a ~30-day plan.

### 5. Video steps
`plan_steps.video_url` (nullable) — steps with a video show a tappable
YouTube thumbnail; steps without one show nothing extra. Currently attached
to a plan's first step only as a placeholder (a fixed, generic video), since
there's no real per-topic video search integrated yet.

### 6. AI-generated plan steps (replacing the old fixed template)
`GeneratePlanSteps` now calls the Anthropic API with the plan's actual
prompt, skill level, time commitment, and target days, using forced tool-use
for reliable structured JSON output, instead of a hardcoded 5-phase
template. Steps come back genuinely specific to the stated goal. Hardened
against Claude occasionally returning the steps field as a JSON string
instead of a native array.

### 7. Per-user plan limits
Since plan generation calls a paid API, `users.max_plans` (default 3, not
mass-assignable — only adjustable server-side) caps how many plans an
account can create. Exceeding it returns a 429 with a message surfaced in
the app instead of a generic error.

### 8. Prompt caching
Split the Claude prompt into a large, **static, cached** system block (task
framing, quality rules, three worked examples) and a small **dynamic** user
message (just that plan's specifics). Verified end-to-end: a cold write
followed by a full cache hit at roughly 10% of normal input-token cost, with
no loss in output quality.

### 9. Plan image spot
A small "image spot" to the left of each row on the Plans list, showing that
plan's emoji (currently entered manually in the DB per plan; the AI-returned
emoji field exists on the model but isn't wired up as the source yet), or a
placeholder icon when a plan has none.

### 10. Landscape orientation support
- Unlocked orientation in `app.json` (was locked to portrait-only).
- New Plan screen content is capped at a max width and centered instead of
  stretching edge-to-edge on wider screens.
- Replaced the native header with a custom component (native iOS headers
  can't be resized via style props) to get a taller bar and a bigger
  hamburger icon, with safe-area insets applied on all sides so it's no
  longer clipped behind the notch in landscape. Confirmed working.

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

## Environments (dev / staging / production)

Three fully isolated environments, each with its own Supabase Postgres
project and its own set of secrets — no shared infra between them.

- **dev**: local only, as described above.
- **staging**: Railway environment tracking the `main` branch. Vars
  documented in `backend/.env.staging.example` (real values live in
  Railway's dashboard, never in the repo).
- **production**: Railway environment tracking a `production` branch.
  Promoted deliberately by merging `main` → `production` via PR once
  staging looks good. Vars documented in `backend/.env.production.example`.

Each Railway environment runs two services from `backend/` (root
directory): `api` (serves HTTP, runs migrations on deploy) and `worker`
(`php artisan queue:work`, since plan generation depends on it exactly like
local dev does).

The mobile app is built per environment via `app.config.ts` + `eas.json`
build profiles (`development` / `staging` / `production`), each with a
distinct bundle identifier (`com.masterit.app.dev` / `.staging` / unsuffixed)
so all three can be installed side by side on one device, and each pointed
at that environment's `EXPO_PUBLIC_API_URL`.

## Git history

Four commits so far: initial scaffold, login/register + iOS Simulator dev
config, drawer navigation + duration + video + AI generation + plan limits,
and prompt caching. The plan-image-spot and landscape work above are not
yet committed.
