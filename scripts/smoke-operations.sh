#!/usr/bin/env bash
# Executar somente no Compose de testes: usa o banco de patrimônio e pausa o worker.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T asset-service node - < scripts/test-import.cjs
docker compose stop notification-worker
trap 'docker compose start notification-worker' EXIT
docker compose exec -T gateway node - < scripts/test-dlq.cjs
