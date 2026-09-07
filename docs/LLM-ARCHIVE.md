# Optional LLM model archive

A cold Hugging Face hub can live on a spare disk (on Skull Ranch that is the Seagate USB at `/mnt/Lolipop/hf-archive`). The live sparkrun cache stays on NVMe (`~/.cache/huggingface`). When the archive is **enabled**, recipe launch resolves **NVMe → archive → Hugging Face**. Weights are copied onto NVMe before vLLM starts. Do not point `HF_HOME` at the archive.

The archive is **off by default**. Other Recipe Deck hosts do not need a spare disk. Enable it in **Settings → Model archive** (or set `HF_ARCHIVE_ENABLED` + `HF_ARCHIVE_DIR` in `$SPARK_VLLM_ROOT/.env`). Saving Settings applies immediately — no Recipe Deck restart.

## Host CLI

`scripts/llm-archive` (install to `~/.local/bin/llm-archive`):

- `ls` — NVMe / archive / hot
- `stash <repo>` / `stash --all-cold` — move non-hot NVMe trees to the archive (skips the hot pair; root-owned leftover stubs are removed after verify)
- `promote <repo>` — copy archive → NVMe
- `pull <repo>` — download into the archive only
- `ensure <repo>` — the launch chain

Config: `~/.config/llm-archive/config.env` and `hot-models.txt` (host-only; not required). Token is read from `$SPARK_VLLM_ROOT/.env` (`HF_TOKEN=`); do not `source` that file. Empty `HF_ARCHIVE` disables promote/stash/pull.

## sparkrun wrapper

`scripts/sparkrun-with-archive` sits at `~/.local/bin/sparkrun` and execs `sparkrun.real`. It only intercepts `run` (parses `model:` and calls `ensure`). `stop` and every other subcommand pass through.

## Recipe Deck

Before spawn, Deck runs `llm-archive ensure` with `HF_ARCHIVE` from Settings (empty when the archive is off). Watchdog starts after that. BOOTING cache UI can show `source: nvme | archive | huggingface` only when an archive path is active.

Do not restart Recipe Deck while a recipe is HEALTHY with autostart on — `run()` `sparkrun stop`s first.
