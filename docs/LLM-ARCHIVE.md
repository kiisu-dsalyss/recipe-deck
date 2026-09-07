# Lolipop LLM archive

Cold Hugging Face snapshots live on the Seagate USB at `/mnt/Lolipop/hf-archive`. The live sparkrun cache stays on NVMe (`~/.cache/huggingface`). Recipe launch resolves **NVMe → archive → Hugging Face**. Weights are copied onto NVMe before vLLM starts. Do not point `HF_HOME` at Lolipop.

## Host CLI

`scripts/llm-archive` (install to `~/.local/bin/llm-archive`):

- `ls` — NVMe / archive / hot
- `stash <repo>` / `stash --all-cold` — move non-hot NVMe trees to the archive (skips the hot pair; root-owned leftover stubs are removed after verify)
- `promote <repo>` — copy archive → NVMe
- `pull <repo>` — download into the archive only
- `ensure <repo>` — the launch chain

Config: `~/.config/llm-archive/config.env` and `hot-models.txt`. Token is read from `$SPARK_VLLM_ROOT/.env` (`HF_TOKEN=`); do not `source` that file.

## sparkrun wrapper

`scripts/sparkrun-with-archive` sits at `~/.local/bin/sparkrun` and execs `sparkrun.real`. It only intercepts `run` (parses `model:` and calls `ensure`). `stop` and every other subcommand pass through.

## Recipe Deck

`HF_ARCHIVE_DIR` defaults on when `/mnt/Lolipop/hf-archive` exists. Before spawn, Deck runs `llm-archive ensure` (watchdog starts after that). BOOTING cache UI can show `source: nvme | archive | huggingface`.

Do not restart Recipe Deck while a recipe is HEALTHY with autostart on — `run()` `sparkrun stop`s first.
