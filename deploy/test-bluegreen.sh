#!/usr/bin/env bash
# Teste do blue-green (issue #17), usado no CI: v1 → v2 → rollback com tráfego contínuo e nenhuma falha.
# Precisa das imagens locais: IMAGE_PREFIX=local/gestao_ti TAGS="v1 v2" deploy/publish.sh --no-push
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
export IMAGE_PREFIX=${IMAGE_PREFIX:-local/gestao_ti} DRAIN_SECONDS=${DRAIN_SECONDS:-3}
B=http://localhost:${HTTP_PORT:-8080}
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
running() { BLUE_TAG=x GREEN_TAG=x WORKER_TAG=x docker compose -f deploy/docker-compose.prod.yml --env-file .env ps --status running --services | sort | paste -sd' ' -; }

rm -rf deploy/state
bash deploy/deploy.sh v1
expect "$(bash deploy/deploy.sh status)" "ativa: blue · azul: v1 · verde: none · worker: v1" "primeiro deploy sobe na cor azul"

# Sessão aberta antes da troca: as duas cores usam o mesmo JWT_SECRET, então o login continua valendo.
JAR=$(mktemp)
curl -s -c "$JAR" -o /dev/null -X POST "$B/api/auth/login" -H 'X-Requested-With: gestao-ti' -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"

# Tráfego contínuo durante os dois deploys: API (passa por gateway e asset-service) e a página do front.
CODES=$(mktemp); RUN=$(mktemp)
( while [ -f "$RUN" ]; do
    curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "$B/api/sectors" >> "$CODES"
    curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "$B/" >> "$CODES"
    sleep 0.05
  done ) &
LOOP=$!

bash deploy/deploy.sh v2
expect "$(bash deploy/deploy.sh status)" "ativa: green · azul: v1 · verde: v2 · worker: v2" "v2 sobe na cor verde e o tráfego muda para ela"
expect "$(docker inspect -f '{{.Config.Image}}' gestao_ti_prod-gateway-green-1)" "$IMAGE_PREFIX-gateway:v2" "gateway verde roda a imagem v2"
expect "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$B/api/auth/session")" 200 "quem estava logado continua logado depois da troca"

bash deploy/deploy.sh rollback
expect "$(bash deploy/deploy.sh status)" "ativa: blue · azul: v1 · verde: v2 · worker: v1" "rollback volta para a azul com a v1"

rm -f "$RUN"; wait "$LOOP"
TOTAL=$(wc -l < "$CODES" | tr -d ' ')
FAILS=$(grep -cv '^200$' "$CODES" || true)
echo "     $TOTAL requisições durante os deploys, $FAILS com erro"
[ "$TOTAL" -gt 200 ] && echo "ok   tráfego contínuo durante as trocas" || { echo "FAIL poucas requisições ($TOTAL)"; exit 1; }
expect "$FAILS" 0 "nenhuma requisição falhou (zero downtime)"
expect "$(running)" "asset-service-blue edge gateway-blue mailpit notification-worker postgres-assets postgres-tickets rabbitmq ticket-service-blue web-blue" "só a cor ativa fica no ar"
