#!/usr/bin/env bash
# Deploy recipe-deck to a remote GB10-class inference host (DGX Spark, Asus GX10, Dell, etc.): rsync tree, install, build, restart user service.
# Set DEPLOY_SSH in operator.local.env (see operator.local.env.example) or pass DEPLOY_HOST=user@host once.
# Run from a machine that can SSH to the host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "${ROOT}/operator.local.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/operator.local.env"
  set +a
fi

REMOTE="${DEPLOY_HOST:-${DEPLOY_SSH:-}}"
# Remote path only: relative segment is under *remote* $HOME (do not use ~ here — sourcing would expand locally).
REL="${DEPLOY_REMOTE_PATH:-repos/recipe-deck}"

if [[ -z "${REMOTE}" ]]; then
  echo "error: set DEPLOY_SSH in operator.local.env (copy from operator.local.env.example) or pass DEPLOY_HOST=user@host once." >&2
  echo "see: ${ROOT}/docs/OPERATOR-LOCAL.md" >&2
  exit 1
fi

echo "rsync -> ${REMOTE}:${REL}/"
# Exclude remote-local/runtime data so --delete does not wipe operator state.
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude demo \
  --exclude recipes \
  --exclude .env \
  --exclude operator.local.env \
  --exclude .current-recipe \
  ./ "${REMOTE}:${REL}/"

echo "remote: npm ci && npm run build && restart"
if [[ "${REL}" == /* ]]; then
  remote_cd="cd $(printf '%q' "${REL}")"
else
  remote_cd="cd \"\$HOME/${REL}\""
fi
ssh "${REMOTE}" "export NVM_DIR=\"\$HOME/.nvm\" && . \"\$NVM_DIR/nvm.sh\" && ${remote_cd} && npm ci && npm run build && systemctl --user restart recipe-deck.service && systemctl --user is-active recipe-deck.service"

echo "deploy ok"
