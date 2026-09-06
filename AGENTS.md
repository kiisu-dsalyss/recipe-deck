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
   - Spawns `run-recipe.py <recipe> --port <port>` as detached child (solo), or `sparkrun run <recipe.yaml>` (sparkrun-cluster)
   - Cluster classification: `recipeProbe.classifyRecipeLaunch` — `min_nodes>1` OR `recipe_version 2/2.0` + `runtime`
   - Cluster stop: best-effort `sparkrun stop <recipe>` (60s cap) then SIGTERM/SIGKILL parent
   - Reads stdout/stderr line-by-line into ring buffer + rolling files
   - Phase machine: `IDLE` -> `BOOTING` -> `HEALTHY` (via READY_REGEX) -> `ERROR`/`IDLE`
   - Graceful stop: SIGTERM -> grace period -> SIGKILL; Force: SIGKILL directly
   - Auto-detects spark-vllm-docker container reuse warning
   - Crash auto-restart: on unexpected exit (not user stop), phase → `ERROR`, waits `AUTORESTART_COOLDOWN_MS` (default 30s), then relaunches the same recipe. Cancelled on intentional stop/kill or when `AUTORESTART_CURRENT_RECIPE=false`.

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
   - `GET/POST /api/settings/auto-start` — read/write `.current-recipe` state (recipe stem + auto-start + auto-restart flags)
   - `POST /api/settings/auto-start/toggle` — toggle auto-start flag only
   - `POST /api/settings/auto-restart/toggle` — toggle auto-restart flag only

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
- **Auto-restart**: `AUTORESTART_CURRENT_RECIPE` (default `true`) in `.current-recipe` — when the runner exits unexpectedly, `SlotController` schedules a relaunch after `AUTORESTART_COOLDOWN_MS`. Cancelled on intentional stop/kill. Toggled via the ↻ icon next to autostart in RunningModelPanel or the Settings modal.
- **Sparkrun cluster runner**: Recipes with `min_nodes>1` or `recipe_version 2/2.0` + `runtime` are launched via `sparkrun run <recipe>` (config: `SPARKRUN_BIN`, `SPARKRUN_EXTRA_ARGS`) and stopped via `sparkrun stop <launched-path>` (prefer the `.recipe-deck-tmp/run-*.yaml` path when HF merge created a temp copy—not the source stem alone). Cluster recipes get a `[cluster×N]` badge in the runner select and honour the YAML `port:` for metrics scraping. Raise `HEALTH_PROBE_TIMEOUT_MS` for large multi-node weight loads.
- **Lolipop archive**: `scripts/llm-archive` + `scripts/sparkrun-with-archive` resolve NVMe → `/mnt/Lolipop/hf-archive` → Hugging Face before serve. See [docs/LLM-ARCHIVE.md](docs/LLM-ARCHIVE.md). Do not set `HF_HOME` to the USB disk.
- **Host CPU chip**: Header shows `CPU · N%` from `/proc/stat` alongside the Disk and GPU chips (Linux only; `n/a` on other platforms).
- **House cluster examples** (live under `$SPARK_VLLM_ROOT/recipes/cluster/`, not in this npm tree): `qwen38-flash-next-nvfp4-ep-mtp3-1m-tp2-vllm` (vision + YaRN 1M), `deepseek-v4-flash-0731-dspark-1m-tp2-vllm` (text 1M).

## Config file hierarchy

| File | Purpose |
|------|---------|
| `.env` (repo root) | App runtime: ports, SPARK_VLLM_ROOT, LOG_DIR, etc. |
| `$SPARK_VLLM_ROOT/.env` | spark-vllm-docker: HF_TOKEN, port knobs, Python env |
| `.current-recipe` (repo root) | Auto-start / auto-restart state: `CURRENT_RECIPE=<stem>` + `AUTOSTART_CURRENT_RECIPE=true|false` + `AUTORESTART_CURRENT_RECIPE=true|false` |
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
