# Recipe Deck

**Recipe Deck** is an operator web UI for **NVIDIA DGX Spark**–class systems—**GB10**, **Asus GX10**, and equivalent Spark-family inference boxes. It is **not** a replacement for the inference stack: you still need **[spark-vllm-docker](https://github.com/eugr/spark-vllm-docker)** (recipes + `run-recipe.py`) on the same host, and for multi-node cluster recipes you also need **[sparkrun](https://github.com/scitrera/sparkrun)** with a configured cluster (SSH mesh, fabric NICs, HF cache, Docker images).

The app is a **single Node.js process** that serves a **React (Vite)** front end, a **REST** control plane, and a **WebSocket** log stream. It is typically run **natively** under **systemd --user** on the head / solo inference host—not containerized.

Recipe Deck runs **one** model at a time on **slot `a`**. That run is either:

| Kind | How Recipe Deck launches it | Typical recipes |
|------|-----------------------------|-----------------|
| **solo** | `python3 …/run-recipe.py <yaml> --port <port> [--solo]` | Single-node vLLM / SGLang YAML under `recipes/` |
| **sparkrun-cluster** | `SPARKRUN_BIN [SPARKRUN_EXTRA_ARGS] run <yaml>` | `recipe_version: "2"` + `runtime`, or `min_nodes > 1` (e.g. `recipes/cluster/…`) |

Stop / force-kill always tears down the managed child. For cluster runs, Recipe Deck also best-effort runs `sparkrun stop <path-actually-passed-to-run>` (often a HF-token-merged copy under `$SPARK_VLLM_ROOT/.recipe-deck-tmp/`) before SIGTERM/SIGKILL, so containers are not left orphaned.

## Screenshot

![Recipe Deck: running model logs and raw recipe YAML while vLLM boots (BOOTING).](Recipe-Deck-Boot.png)

---

## Table of contents

- [Screenshot](#screenshot)
- [Features](#features)
- [Requirements](#requirements)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Which configuration file?](#which-configuration-file)
- [Solo vs sparkrun-cluster](#solo-vs-sparkrun-cluster)
- [Auto-start and auto-restart](#auto-start-and-auto-restart)
- [First run (development)](#first-run-development)
- [First run (production + systemd)](#first-run-production--systemd)
- [Local development](#local-development)
- [Configuration](#configuration)
- [npm scripts](#npm-scripts)
- [Production build](#production-build)
- [Deployment](#deployment)
  - [Via SSH](#via-ssh)
  - [Local (on the inference host)](#local-on-the-inference-host)
- [API](#api)
- [WebSocket](#websocket)
- [Security and network](#security-and-network)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Upstream](#upstream)
- [License](#license)
- [Reporting security issues](#reporting-security-issues)
- [Contributing](#contributing)

---

## Features

- Recipe list with **most-recently-used** ordering (persisted run counts) and optional **`[cluster×N]`** badge for sparkrun recipes.
- Start / stop / force-kill a **single** runner (**slot `a`** only; legacy `b` is rejected).
- Live **log** view with bounded memory and optional rolling files on disk.
- Edit **recipe YAML** from the UI; optional **`HF_TOKEN`** merge when the recipe omits `env.HF_TOKEN` (temp copy under `.recipe-deck-tmp`).
- **Settings** for ports, Python path, ready-line regex, timeouts, and polling—written to the same env files the stack uses; restart Recipe Deck to apply most knobs.
- Best-effort **metrics** in the header and live-stats panel:
  - Disk free under `SPARK_VLLM_ROOT`
  - **Host CPU utilization** (`/proc/stat`, Linux; shown as `CPU · N%` between Disk and GPU)
  - `nvidia-smi` GPU snapshot
  - vLLM `/metrics` (tok/s) and OpenAI-compatible `/v1/models` on the **recipe listen port**
  - Optional **`docker ps`** match of image/container to that port
- **Auto-start** the last recipe when the Deck process starts (`.current-recipe`).
- **Auto-restart** on unexpected exit: stay in `ERROR`, show a **30 s circular countdown**, then relaunch the same stem (cancelled on intentional stop/kill). Toolbar glyphs sit beside Play.
- **Sparkrun cluster runner** for multi-node recipes (see [Solo vs sparkrun-cluster](#solo-vs-sparkrun-cluster)).
- **UI:** Frosted **glass** panels; **floating dots** background (focal point follows the pointer; smooth drift when the pointer leaves the page; **`prefers-reduced-motion`** freezes the focal point). **Simple UI** in Settings disables dots and header aurora.

---

## Requirements

- **Hard dependency — [spark-vllm-docker](https://github.com/eugr/spark-vllm-docker):** checkout on the **same machine** as Recipe Deck (`SPARK_VLLM_ROOT`) with `run-recipe.py`, `recipes/*.yaml`, and the Python / Docker environment that stack needs.
- **Node.js 20+** (uses `fs.statfs`, `fetch`, modern TypeScript).
- **Target hardware (intended):** DGX Spark **GB10** / Asus **GX10** and similar Spark-family hosts.
- Optional: **`nvidia-smi`** for GPU chips; vLLM **HTTP `/metrics`** for throughput.
- Optional: **`docker`** on `PATH` with permission to run **`docker ps`** so the UI can show image / container for the bound port.
- **For cluster recipes:** **`sparkrun`** on the host (see **`SPARKRUN_BIN`**), a configured sparkrun **cluster** (passwordless SSH between nodes, fabric NICs, shared or synced HF cache, matching container images). Recipe Deck does not provision the cluster; it only invokes `sparkrun run` / `sparkrun stop`.

---

## Stack

| Layer | Technology |
|--------|------------|
| UI | React 19, Vite 6, CSS Modules |
| Server | Express, `ws`, TypeScript → `dist/server` |
| Config | `dotenv`, YAML for recipes |
| Tests | `node:test` under `tests/` (`npm run test` / `npm run ci`) |

Shared types live under `types/`; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/UI.md](docs/UI.md).

---

## Repository layout

| Path | Role |
|------|------|
| `client/` | Vite + React; `client/src/api/client.ts` for HTTP/WS; `client/src/components/README.md` describes UI folders (`shell/`, `recipe/`, `runner/`, etc.) |
| `server/` | Express app, WebSocket hub, slot controller (solo + sparkrun), routes, metrics |
| `types/` | Shared TypeScript types |
| `tests/` | Unit tests for probes, `.current-recipe` parse, HF merge, stems |
| `docs/` | Architecture and operator-local deploy notes |
| `docs/systemd/` | Example **user** systemd unit |
| `scripts/deploy-gb10.sh` | Rsync + remote install/build/restart; **`deploy-gx10.sh`** is a legacy alias |
| `scripts/setup.sh` | Interactive env bootstrap; **`npm run setup`** |
| `scripts/smoke-recipe-probe.ts` | Optional local smoke for recipe classification |

---

## Which configuration file?

| Goal | File | Notes |
|------|------|--------|
| App runtime (ports, **`SPARK_VLLM_ROOT`**, sparkrun, logs, etc.) | **`.env`** at repo root (from **`.env.example`**) | Read by the Node process and by **`EnvironmentFile=`** in systemd. |
| Last recipe + auto-start / auto-restart flags | **`.current-recipe`** at repo root | **Gitignored.** Written on run; cleared on stop / force-kill. |
| Deploy from another machine over SSH | **`operator.local.env`** (from **`operator.local.env.example`**) | **Gitignored.** Only used by **`scripts/deploy-gb10.sh`**. Does **not** replace **`.env`** on the server. |
| HF token / spark launcher knobs | **`$SPARK_VLLM_ROOT/.env`** | Merged into run env; may be injected into a temp recipe YAML. |

---

## Solo vs sparkrun-cluster

Classification is done by `server/recipeProbe.ts` when listing / launching:

| Condition | Kind |
|-----------|------|
| `min_nodes` > 1 | **sparkrun-cluster** |
| `recipe_version` is `2` or `2.0` **and** `runtime` is non-empty | **sparkrun-cluster** |
| Otherwise | **solo** |

**Solo**

- Metrics and health scrape use **`VLLM_PORT`** (or the slot port from app settings), unless the recipe / overrides change the listen port the way `run-recipe.py` does today.
- Stop = SIGTERM → grace → SIGKILL on the `run-recipe.py` tree.

**Sparkrun-cluster**

- Launch: `SPARKRUN_BIN` + optional `SPARKRUN_EXTRA_ARGS` + `run` + recipe path (temp YAML if HF token was merged).
- Metrics / `/v1/models` use the YAML **`defaults.port` / `port:`** field when present (e.g. `8000`).
- Stop: `sparkrun stop <launched-path>` (must be the **temp run path** when one was created—not only the stem under `recipes/`), then kill the parent `sparkrun` process.
- Large cluster boots (100 GB+ weights) often exceed the default solo boot expectation: raise **`HEALTH_PROBE_TIMEOUT_MS`** (default 10 minutes) if the runner hits “Boot timeout” while weights are still loading. Sparkrun’s own ready-wait can be short; Deck health is log-`READY_REGEX`-based on the parent process stream.

Put multi-node recipes under something like `recipes/cluster/` so the UI groups them. Examples on a dual-Spark house tree:

- `cluster/qwen38-flash-next-nvfp4-ep-mtp3-1m-tp2-vllm` — multimodal Qwen3.8-Flash-Next NVFP4, TP2+EP, **1M** ctx via YaRN×4, vision `limit-mm` image/video
- `cluster/deepseek-v4-flash-0731-dspark-1m-tp2-vllm` — text DeepSeek-V4-Flash-0731, TP2, 1M ctx

Those recipes are **not** shipped inside this npm package; they live in your **spark-vllm-docker** (or equivalent) checkout.

**systemd PATH tip:** user units do not load your login shell `PATH`. If `sparkrun` lives in `~/.local/bin`, set either:

```bash
SPARKRUN_BIN=/home/YOU/.local/bin/sparkrun
# and/or
PATH=/home/YOU/.local/bin:/usr/local/bin:/usr/bin:/bin
```

in the Deck **`.env`** referenced by **`EnvironmentFile=`**, then restart the unit.

---

## Auto-start and auto-restart

File **`.current-recipe`** (repo root, gitignored), KEY=VAL lines:

```text
CURRENT_RECIPE=cluster/deepseek-v4-flash-0731-dspark-1m-tp2-vllm
AUTOSTART_CURRENT_RECIPE=true
AUTORESTART_CURRENT_RECIPE=true
```

| Flag | Default | Behavior |
|------|---------|----------|
| `AUTOSTART_CURRENT_RECIPE` | false if unset | On Deck process start, if true and the stem exists, launch that recipe. |
| `AUTORESTART_CURRENT_RECIPE` | **true** if unset | On unexpected child exit, schedule relaunch after **`AUTORESTART_COOLDOWN_MS`** (default **30000**). |

UI: power glyph = auto-start; auto-restart glyph + circular countdown while waiting. Server Settings also exposes the flags. **`POST /api/stop`** and **`POST /api/force-kill`** clear `.current-recipe` and cancel a pending countdown.

---

## First run (development)

1. Clone this repo and **[spark-vllm-docker](https://github.com/eugr/spark-vllm-docker)** on the same machine you will run the stack.
2. **`cd`** to the recipe-deck repo root.
3. Run **`./scripts/setup.sh`** (no Node required) or **`npm run setup`** after **`npm install`**, and enter the absolute path to your spark-vllm-docker checkout when prompted (it checks for **`run-recipe.py`**).  
   Or manually: copy **`.env.example`** → **`.env`** and set **`SPARK_VLLM_ROOT`**.
4. **`npm install`** — use **`npm install`** for local dev (updates lockfile if needed); use **`npm ci`** for clean production installs (see [Production build](#production-build)).
5. **`npm run dev`**
6. Open **`http://127.0.0.1:<port>`** (see **`.env`**; default is often **3000**).

If the UI does not load, see [Troubleshooting](#troubleshooting). There is **no built-in authentication**; the dev server often binds to **all interfaces** unless **`SWITCHER_HOST=127.0.0.1`** — treat the service as **LAN-visible** unless you firewall or tunnel.

---

## First run (production + systemd)

1. On the **inference host**, install **[spark-vllm-docker](https://github.com/eugr/spark-vllm-docker)** and clone this repo (e.g. **`~/repos/recipe-deck`**).
2. **`./scripts/setup.sh`** to create **`.env`** and set **`SPARK_VLLM_ROOT`**, or copy **`.env.example`** → **`.env`** and edit by hand. For cluster hosts, set **`SPARKRUN_BIN`** / **`PATH`** as above.
3. **`npm ci`** then **`npm run build`** (reproducible install from lockfile).
4. Copy **`docs/systemd/recipe-deck.service`** to **`~/.config/systemd/user/`**; set **`WorkingDirectory`**, **`EnvironmentFile=`**, and **`ExecStart`** to match your tree — if **`which node`** is not **`/usr/bin/node`** (e.g. **nvm** / **fnm**), use the **absolute** path to **`node`** in **`ExecStart`**. Optional: **`./scripts/setup.sh --systemd-hint`** prints a suggested snippet.
5. **`systemctl --user daemon-reload`** && **`systemctl --user enable --now recipe-deck.service`**
6. Open **`http://<host>:<SWITCHER_PORT>`** (default **3000**). Restrict exposure (firewall, VPN, or **`SWITCHER_HOST=127.0.0.1`**) — there is **no built-in authentication** when bound to **`0.0.0.0`**.

If the service fails, see [Troubleshooting](#troubleshooting).

---

## Local development

Prefer **`./scripts/setup.sh`** once after clone to create **`.env`** and validate **`SPARK_VLLM_ROOT`**. Flags: **`--deploy`** (also configure **`operator.local.env`** for SSH deploy), **`--systemd-hint`** (print suggested systemd **`ExecStart`** paths).

```bash
npm install
# If you skipped setup.sh, clone https://github.com/eugr/spark-vllm-docker and set:
# export SPARK_VLLM_ROOT=/path/to/spark-vllm-docker
# optional: export LOG_DIR=$PWD/.recipe-deck-logs
npm run dev
```

Open **`http://127.0.0.1:<port>`** (see `.env.example`; default is often **3000**). The dev server typically binds to **all interfaces** unless you set **`SWITCHER_HOST=127.0.0.1`**.

Before opening a PR: **`npm run ci`** (lint, typecheck, 400-line cap, unit tests, production build).

---

## Configuration

**Required variable:** **`SPARK_VLLM_ROOT`** — absolute path to your **[spark-vllm-docker](https://github.com/eugr/spark-vllm-docker)** checkout (**`run-recipe.py`**, **`recipes/`**). Everything else in **`.env`** has defaults or is optional tuning; see **`.env.example`**.

1. Copy **`.env.example`** to **`.env`** at the repo root (or inject the same keys via the environment). Use **`./scripts/setup.sh`** to set **`SPARK_VLLM_ROOT`** safely.

2. Optional overrides: **`RECIPE_DECK_RECIPES_DIR`**, **`RECIPE_DECK_TEMP_DIR`**, **`RUN_RECIPE_PY`**, **`RUN_RECIPE_SH`** — defaults match a normal spark-vllm-docker tree; override if paths differ. The **Settings** page shows resolved paths read-only.

3. **`$SPARK_VLLM_ROOT/.env`** can hold **`HF_TOKEN`**, port knobs, and other keys the launcher reads. Recipe Deck may merge **`HF_TOKEN`** into a temporary recipe copy when the YAML does not define `env.HF_TOKEN`. If the recipe already sets a literal `env.HF_TOKEN`, that value is not overwritten.

4. **Cluster:** **`SPARKRUN_BIN`**, **`SPARKRUN_EXTRA_ARGS`** (space-separated, prepended before `run` / `stop`). Example extra args: `--cluster gx10-dual`.

5. **Crash auto-restart cooldown:** **`AUTORESTART_COOLDOWN_MS`** (default `30000`).

6. **Run counts:** each successful **`POST /api/run`** increments a per–recipe-stem counter stored as **`recipe-run-counts.json`** under **`LOG_DIR`** (default on Linux: `~/.local/share/recipe-deck/logs`).

See **`.env.example`** for **`SWITCHER_PORT`**, **`LOG_DIR`**, log rotation, **`READY_REGEX`**, **`HEALTH_PROBE_TIMEOUT_MS`**, and related variables.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run setup` | Runs **`./scripts/setup.sh`** — **`.env`** bootstrap, optional **`--deploy`** / **`--systemd-hint`** |
| `npm run dev` | `tsx watch` on `server/main.ts`; serves API + proxies Vite dev client |
| `npm run build` | `build:client` then `build:server` |
| `npm run build:client` | Vite production build → `client/dist` |
| `npm run build:server` | `tsc` for `server/` → `dist/server` |
| `npm start` / `npm run start:prod` | `node dist/server/main.js` |
| `npm run typecheck` | Typecheck server and client without emit |
| `npm run lint` | [ESLint](https://eslint.org/) on tracked TS (zero warnings) |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | [Prettier](https://prettier.io/) on TypeScript/CSS sources |
| `npm run test` | Unit tests under `tests/` |
| `npm run check:lines` | Fail if any TS/TSX file exceeds 400 lines |
| `npm run ci` | lint + typecheck + line cap + test + build |

---

## Production build

Use **`npm ci`** for production and CI so installs match **`package-lock.json`**. Use **`npm install`** for local development when you may change dependencies.

```bash
npm ci
npm run build
```

Run with **`SPARK_VLLM_ROOT`** (and other vars) set:

```bash
node dist/server/main.js
```

Ensure **`SWITCHER_HOST`**, **`SWITCHER_PORT`**, and **`LOG_DIR`** match your environment.

---

## Deployment

Two common flows: push the repo from **another machine over SSH** (scripted rsync + remote build), or **work directly on the inference host** where the app and systemd unit already live.

Canonical public tree: **[github.com/kiisu-dsalyss/recipe-deck](https://github.com/kiisu-dsalyss/recipe-deck)**. Keep any private forge mirror in sync with that `main`.

### Via SSH

Use this when you run commands from a **laptop or workstation** that can reach the target over SSH. The repo includes **`scripts/deploy-gb10.sh`** (GB10-class inference hosts — DGX Spark, Asus GX10, Dell, etc.; **`deploy-gx10.sh`** is a legacy alias): it **rsync**s the tree to the host (excluding `node_modules`, `.git`, **`.env`**, **`operator.local.env`**, and remote-local/runtime folders like **`recipes/`**), then **SSH**s in to run **`npm ci`**, **`npm run build`**, and **`systemctl --user restart recipe-deck.service`**.

**Operator-specific SSH and paths** — do **not** commit real SSH users or hostnames. Copy **`operator.local.env.example`** to **`operator.local.env`** (gitignored) and set:

- **`DEPLOY_SSH`** — `user@host` for the target machine (required unless you pass **`DEPLOY_HOST`** for a one-off).
- **`DEPLOY_REMOTE_PATH`** (optional) — path on the **remote** host, relative to remote `$HOME` (e.g. `repos/recipe-deck`) or absolute. Do **not** use `~` in that file; tilde expands on the machine running the deploy script, not on the target.

Example one-off deploy without a local env file:

```bash
DEPLOY_HOST=user@your-inference-host.example ./scripts/deploy-gb10.sh
```

**Rsync warning:** **`deploy-gb10.sh`** excludes **`.env`** and **`recipes/`** so a **`--delete`** sync does not wipe secrets or remote-local content. **Never** run raw **`rsync -avz --delete`** against the remote app tree without the same excludes unless you intend to remove that data.

Details: **[docs/OPERATOR-LOCAL.md](docs/OPERATOR-LOCAL.md)**.

### Local (on the inference host)

Use this when you are **already logged into** the machine that runs Recipe Deck (SSH session, local console, or inline terminal on the box) and the repo is already checked out there (e.g. **`$HOME/repos/recipe-deck`** matching your systemd **`WorkingDirectory`**).

1. Go to the repository root:

   ```bash
   cd /path/to/recipe-deck
   ```

   (Often **`~/repos/recipe-deck`** if you mirror the example layout.)

2. Optionally update sources (**`git pull`**, unpack a tarball, etc.) so the tree matches what you want to run.

3. Install dependencies and build:

   ```bash
   npm ci
   npm run build
   ```

4. Restart the app (user systemd unit):

   ```bash
   systemctl --user restart recipe-deck.service
   systemctl --user is-active recipe-deck.service
   ```

Ensure **`SPARK_VLLM_ROOT`** and other variables are still set for the service (typically via **`EnvironmentFile=`** pointing at **`%h/.../recipe-deck/.env`**). Editing **`.env`** on the host does not require rsync; restart the unit after changes.

### systemd (first-time setup)

Copy **`docs/systemd/recipe-deck.service`** to **`~/.config/systemd/user/`**, adjust **`WorkingDirectory`**, **`ExecStart`**, and **`EnvironmentFile=`** to your **`.env`**. If Node is not at **`/usr/bin/node`** (e.g. **nvm** / **fnm**), set **`ExecStart`** to the output of **`command -v node`** on that host — user systemd units do not load login-shell **`PATH`**. **`./scripts/setup.sh --systemd-hint`** prints a suggested snippet. Then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now recipe-deck.service
```

The example unit may reference **`EnvironmentFile=%h/.../recipe-deck/.env`**. Use the **Via SSH** or **Local** flow above for subsequent deploys.

---

## API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/state` | Runner snapshot (`slots.a`), metrics (incl. `cpu`), recipes, listen display; slot may include `autoRestartAtMs` / `autoRestartCooldownMs` |
| `POST` | `/api/run` | Body: `{ recipeStem, solo?, useBuffer?, yamlBuffer?, recipeOverrides?, autoStart?, autoRestart? }`. Optional `slot: "a"`. |
| `POST` | `/api/stop`, `/api/force-kill` | Clears `.current-recipe`; cluster runs invoke `sparkrun stop` first |
| `GET` | `/api/recipe?name=` | Read YAML under `recipes/` |
| `POST` | `/api/recipe/save` | Write YAML |
| `GET` / `POST` | `/api/settings/hf-token` | Read/write `HF_TOKEN` in `SPARK_VLLM_ROOT/.env` |
| `GET` / `POST` | `/api/settings/app` | Ports, `PYTHON`, `READY_REGEX`, timeouts, intervals (restart to apply) |
| `GET` / `POST` | `/api/settings/auto-start` | Read / write `.current-recipe` (`stem` / flags) |
| `POST` | `/api/settings/auto-start/toggle` | Flip auto-start only |
| `POST` | `/api/settings/auto-restart/toggle` | Flip auto-restart only |
| `POST` | `/api/service/restart` | User systemd restart of the Recipe Deck unit (production; optional **`RECIPE_DECK_SYSTEMD_UNIT`**) |

---

## WebSocket

- **`GET /ws`** — JSON lines: `{ type: "log", ... }`, `{ type: "state", ... }` (see server implementation for full shapes). State payloads include the same slot fields as **`GET /api/state`** (phase, countdown timestamps, metrics chips).

---

## Security and network

- There is **no built-in authentication**. If **`SWITCHER_HOST=0.0.0.0`**, the UI and API are reachable on the LAN; restrict with firewall, VPN, or bind to **`127.0.0.1`** and use SSH port forwarding.
- Secrets belong in **`.env`** / **`$SPARK_VLLM_ROOT/.env`**, not in recipe YAML committed to git, when avoidable. Temp run YAMLs under `.recipe-deck-tmp` may contain an injected **`HF_TOKEN`**—treat that directory as sensitive and do not publish it.
- In the web UI, **?** in the header opens **About** (version, upstream link, security expectations).

---

## Troubleshooting

| Symptom | Things to check |
|---------|-------------------|
| Service fails after deploy | Remote **`.env`** missing or wrong path: **`EnvironmentFile=`** in systemd; confirm **`deploy-gb10.sh`** excludes **`.env`** and **`recipes/`** during rsync. |
| Runner never **HEALTHY** | **`READY_REGEX`** matches your vLLM / sparkrun log line; increase **`HEALTH_PROBE_TIMEOUT_MS`** for large cluster weight loads (often 8–15+ minutes). |
| Cluster recipe launches as solo | Probe needs `min_nodes > 1` **or** `recipe_version: "2"` / `"2.0"` **plus** non-empty `runtime`. |
| `sparkrun: command not found` under systemd | Set **`SPARKRUN_BIN`** to an absolute path and/or put `~/.local/bin` on **`PATH`** in Deck **`.env`**; restart the unit. |
| Stop leaves sparkrun containers up | Deck must stop the **temp** run YAML path (HF merge). Upgrade past the “stop stem path only” bug; or `sparkrun stop --all` as a manual recovery. |
| No Docker image/name in UI | Process user cannot run **`docker ps`**; or nothing publishes the expected port. |
| Header CPU always empty | Host CPU chip is Linux `/proc/stat` only; first sample may be `null` while priming the delta. |
| Wrong recipes list | **`SPARK_VLLM_ROOT`** and **`recipes/`** path; **`chokidar`** refresh on file changes. |
| Auto-restart loops a bad recipe | Toggle auto-restart off, or stop/kill to clear `.current-recipe`; fix the recipe before re-enabling. |

---

## Documentation

| Doc | Content |
|-----|---------|
| [docs/README.md](docs/README.md) | Index of docs in this folder |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow, modules, frontend rules, solo vs cluster |
| [docs/UI.md](docs/UI.md) | CSS tokens, glass surfaces, background canvas, UI DRY conventions |
| [docs/OPERATOR-LOCAL.md](docs/OPERATOR-LOCAL.md) | **`operator.local.env`**, **`deploy-gb10.sh`**, gitignored local identifiers |
| [docs/systemd/recipe-deck.service](docs/systemd/recipe-deck.service) | Example systemd user unit |
| [AGENTS.md](AGENTS.md) | Short agent-oriented project map |

---

## Upstream

- **spark-vllm-docker:** [github.com/eugr/spark-vllm-docker](https://github.com/eugr/spark-vllm-docker)
- **sparkrun:** [github.com/scitrera/sparkrun](https://github.com/scitrera/sparkrun)
- **This app (canonical):** [github.com/kiisu-dsalyss/recipe-deck](https://github.com/kiisu-dsalyss/recipe-deck)

Forge URL for a private mirror (if any) is **not** stored in tracked files; use **`git remote -v`** locally or optional **`GIT_REMOTE_SSH_URL`** in **`operator.local.env`** (see **`operator.local.env.example`**) for runbooks only.

---

## License

Recipe Deck is licensed under the **MIT License** — see [LICENSE](LICENSE).

Dependencies (see `package.json` / `package-lock.json`) remain under their respective licenses. [spark-vllm-docker](https://github.com/eugr/spark-vllm-docker) and [sparkrun](https://github.com/scitrera/sparkrun) are separate projects; use them under their licenses when you deploy the stack.

The **`"private": true`** field in `package.json` only prevents accidental **`npm publish`**; this app is meant to be **cloned and run from source**, not installed as a global npm package.

---

## Reporting security issues

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and handling secrets.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
