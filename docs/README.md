# Recipe Deck — docs index

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, repository layout, frontend rules |
| [UI.md](UI.md) | CSS tokens, glass panels, background canvas, DRY conventions |
| [../client/src/components/README.md](../client/src/components/README.md) | React **`components/`** folder map (`shell/`, `recipe/`, `runner/`, …) |
| [OPERATOR-LOCAL.md](OPERATOR-LOCAL.md) | Gitignored **`operator.local.env`**, deploy SSH, remote paths |
| [LLM-ARCHIVE.md](LLM-ARCHIVE.md) | Lolipop USB cold HF cache, `llm-archive`, sparkrun wrapper |
| [../scripts/setup.sh](../scripts/setup.sh) | Interactive **`.env`** bootstrap; **`npm run setup`** — see [README.md](../README.md) |
| [examples/recipe-deck-demo-qwen-0.5b.yaml](examples/recipe-deck-demo-qwen-0.5b.yaml) | Example tiny recipe for recordings (copy to **`$SPARK_VLLM_ROOT/recipes/`**); local **`demo/`** Playwright harness is **gitignored** |
| [systemd/recipe-deck.service](systemd/recipe-deck.service) | Example **user** systemd unit |
| [../LICENSE](../LICENSE) | MIT license (project code) |
| [../SECURITY.md](../SECURITY.md) | Reporting vulnerabilities, secrets policy |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute |

The project overview, API summary, and deployment overview are in the repository **[README.md](../README.md)**.
