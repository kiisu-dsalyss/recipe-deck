# Recipe Deck — Project Knowledge

## What it is
Recipe Deck is an **operator web UI** for **NVIDIA DGX Spark**-class systems (GB10, GX10). It orchestrates [spark-vllm-docker](https://github.com/eugr/spark-vllm-docker), running one vLLM-backed model at a time via `run-recipe.py`, streaming logs, editing recipe YAML, and managing settings.

## Stack
- **Frontend**: React 19 + Vite 6 + CSS Modules (no inline styles for layout/theme)
- **Backend**: Node.js (Express + ws) serving REST API, WebSocket logs, and SPA
- **Config**: `.env` at repo root + `$SPARK_VLLM_ROOT/.env` for HF_TOKEN and spark-specific vars. State file: `.current-recipe` at repo root (auto-start config).
- **Types**: Shared under `types/`; feature contracts in colocated `*.types.ts` (no exported object shapes in `.tsx` or large service files)
- **Lints**: ESLint 9.x, Prettier, TypeScript, `npm run check:lines` (400-line cap). Local/CI gate: `npm run ci` (lint, typecheck, line cap, unit tests, build).

## Repository layout

```
types/          -- Shared TypeScript types (slot, api, ws, index re-exports)
server/         -- Express app, WS hub, slot controller, metrics, routes, helpers
client/src/     -- Vite + React SPA
  api/client.ts -- HTTP/WS API client functions (fetch-based, no library)
  hooks/        -- useRecipeDeck (main state + WS + polling), useTheme, etc.
  components/   -- Feature folders: shell/, recipe/, runner/, metrics/, settings/, modals/, ui/
  styles/       -- CSS Modules + global.css + tokens.css
  lib/          -- helpers: formatBytes, pathBasename, runnerState, recipeDeckBroken
docs/           -- ARCHITECTURE.md, UI.md, OPERATOR-LOCAL.md, systemd unit, examples
scripts/        -- deploy-gb10.sh, setup.sh
tests/          -- node:test unit tests (critical helpers only)
```

## How it works — Data flow

1. **Server startup** (`server/main.ts`): Loads config from `.env`, creates `DeckService`, registers Express routes, sets up Vite dev middleware (in dev) or static serve (in prod), creates WebSocket hub on `/ws`, listens on `SWITCHER_PORT`.

2. **DeckService** (`server/deckService.ts`): Central orchestrator.
   - Watches `recipes/*.yaml` with `chokidar` for hot-reload
   - Manages `SlotController` (single runner, wire id `"a"`)
   - Polls: disk usage (45s), GPU nvidia-smi (10s), vLLM metrics (5s), HF cache progress (2s)
   - Provides `getFullState()` aggregating all data

3. **SlotController** (`server/slotController.ts`): Process lifecycle manager.
   - Spawns `run-recipe.py <recipe> --port <port>` as detached child process
   - Reads stdout/stderr line-by-line into ring buffer + rolling files
   - Phase machine: `IDLE` -> `BOOTING` -> `HEALTHY` (via READY_REGEX) -> `ERROR`/`IDLE`
   - Graceful stop: SIGTERM -> grace period -> SIGKILL; Force: SIGKILL directly
   - Auto-detects spark-vllm-docker container reuse warning

4. **Routes** (`server/routes/registerRoutes.ts`):
   - `GET /api/state` — full state snapshot
   - `POST /api/run` — start recipe (with solo, buffer yaml, overrides, auto-start flag)
   - `POST /api/stop`, `POST /api/force-kill` — also clears `.current-recipe`
   - `GET/POST/DELETE /api/recipe` — CRUD on recipe YAML files
   - `POST /api/recipe/broken` — set `recipe_deck.broken` metadata
   - `GET/POST /api/settings/hf-token` — read/write HF_TOKEN in env file
   - `GET/POST /api/settings/app` — app settings (ports, regex, intervals)
   - `POST /api/service/restart` — systemd restart (production)
   - `GET/POST /api/docker/*` — container management
   - `GET/POST /api/settings/auto-start` — read/write `.current-recipe` state
   - `POST /api/settings/auto-start/toggle` — toggle auto-start flag only

5. **WebSocket** (`server/wsHub.ts`):
   - On connect: sends full state snapshot + log snapshot
   - On process output: broadcasts `log` messages
   - On state change: broadcasts `state` messages
   - Client reconnects with exponential backoff (800ms -> 30s max)

6. **Frontend** (`client/src/App.tsx`):
   - `useRecipeDeck()` hook: manages state polling (5s idle, 2s booting/healthy), WS connection, all API calls
   - Two-column layout: RunningModelPanel (left) + EditorPanel (right)
   - When runner is HEALTHY: carousel switches between LiveStatsPanel and EditorPanel
   - FloatingDotsBackground: canvas-based animated dots following cursor
   - Simple UI mode: disables dots and header aurora

7. **Auto-start** (`server/currentRecipe.ts` + `DeckService.tryAutoStart()`):
   - On `DeckService.init()`: reads `.current-recipe`, if `AUTOSTART_CURRENT_RECIPE=true` and recipe file exists → auto-launches it
   - `.current-recipe` at repo root (gitignored) — never touches `.env` or spark-vllm-docker dir
   - Written by `/api/run` (with auto-start flag from client checkbox), cleared by `/api/stop` and `/api/force-kill`
   - New routes: `GET/POST /api/settings/auto-start`, `POST /api/settings/auto-start/toggle`

## Key concepts

- **Single runner**: Only `slot "a"` exists. Legacy `slot: "b"` is rejected.
- **Recipe stems**: Relative paths under `recipes/` without `.yaml` extension, e.g. `cluster/qwen3.5-122b-fp8`. Sanitized to `[a-zA-Z0-9._/-]`.
- **HF_TOKEN merge**: When recipe YAML has no `env.HF_TOKEN`, Recipe Deck writes a temporary YAML with the token injected from `.env`.
- **Docker image aliases**: `docker tag SOURCE TARGET` before each run for sidekick parallel pattern.
- **Run counts**: Persisted in `LOG_DIR/recipe-run-counts.json`; recipes sorted by MRU.
- **Health probe**: Regex match on log lines (default: `Uvicorn running|Application startup complete`). Timeout: 10 min.
- **Auto-start**: `.current-recipe` file at app root stores which recipe to launch on boot. Controlled by checkbox in RunningModelPanel (checked by default) and Settings modal. Cleared on stop/kill.

## Config file hierarchy

| File | Purpose |
|------|---------|
| `.env` (repo root) | App runtime: ports, SPARK_VLLM_ROOT, LOG_DIR, etc. |
| `$SPARK_VLLM_ROOT/.env` | spark-vllm-docker: HF_TOKEN, port knobs, Python env |
| `.current-recipe` (repo root) | Auto-start state: `CURRENT_RECIPE=<stem>` + `AUTOSTART_CURRENT_RECIPE=true|false` |
| `operator.local.env` (gitignored) | Deploy-only: SSH credentials, remote path |

## Making changes

- **Interfaces**: Put exported types in `types/` or a colocated `*.types.ts`. Keep `AppConfig` in `server/config.types.ts`.
- **Add a setting**: Update `AppConfig` in `server/config.types.ts` / `loadConfig` in `server/config.ts`, add to `envFile` handling in `envMerge.ts`, add route in `registerRoutes.ts`, add UI in `ServerSettingsModal.tsx` and `AppSettingsPanel.tsx`.
- **Add a metric**: Add to `vllmLiveStats.ts` parsing, add field to `VllmLiveStats` type, add stat card component in `liveStats/stats/`, wire into `LiveStatsPanel`.
- **Add a route**: Add handler in `registerRoutes.ts`, add client function in `api/client.ts`, add type in `types/api.ts` or `types/slot.ts`, wire into UI.
- **CSS**: CSS Modules only (`*.module.css`). Tokens in `styles/tokens.css`.

## Commit discipline (user preference)
Every new feature or bug fix must have a **detailed commit message** with bullet-point body explaining WHAT changed and WHY. Run `git commit --amend` if a message is too terse. Commit frequently — context compaction loses the plot.

## Verification
- `npm run ci` — lint, typecheck, line cap, unit tests, production build
- `npm run lint` — ESLint (zero warnings)
- `npm run typecheck` — TypeScript typecheck (server + client)
- `npm run check:lines` — no TS/TSX over 400 lines
- `npm run test` — unit tests (`tests/`)
- `npm run build` — Production build
- `npm run format` — Prettier formatting
