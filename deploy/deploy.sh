#!/usr/bin/env bash
# Deploy blue-green (ADR 0008, issue #17).
#   deploy/deploy.sh <tag>      sobe a versão <tag> na cor parada, testa, troca o tráfego e desliga a cor antiga
#   deploy/deploy.sh rollback   religa a cor anterior (com a versão que ela tinha) e volta o tráfego para ela
#   deploy/deploy.sh status     mostra a cor ativa e a versão de cada cor
# As imagens vêm de IMAGE_PREFIX (padrão: GitHub Container Registry do repositório), publicadas pelo CI.
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../.env ] || { echo "Falta o arquivo .env na raiz do projeto (copie de .env.example)."; exit 1; }
mkdir -p state
STATE=state/colors.env
ACTIVE='' BLUE_TAG=none GREEN_TAG=none WORKER_TAG=none
# shellcheck disable=SC1090
[ -f "$STATE" ] && . "$STATE"
export IMAGE_PREFIX=$(echo "${IMAGE_PREFIX:-ghcr.io/taldofernando/gestao_ti}" | tr '[:upper:]' '[:lower:]')
DRAIN=${DRAIN_SECONDS:-10}

dc() { BLUE_TAG=$BLUE_TAG GREEN_TAG=$GREEN_TAG WORKER_TAG=$WORKER_TAG docker compose -f docker-compose.prod.yml --env-file ../.env "$@"; }
save() { printf 'ACTIVE=%s\nBLUE_TAG=%s\nGREEN_TAG=%s\nWORKER_TAG=%s\n' "$ACTIVE" "$BLUE_TAG" "$GREEN_TAG" "$WORKER_TAG" > "$STATE"; }
other() { [ "$1" = blue ] && echo green || echo blue; }
tag_of() { [ "$1" = blue ] && echo "$BLUE_TAG" || echo "$GREEN_TAG"; }
services() { echo "web-$1 gateway-$1 ticket-service-$1 asset-service-$1"; }
log() { echo "[deploy] $*"; }

# Bancos, broker e SMTP compartilhados. Nada depende do mailpit, então ele precisa subir explicitamente.
start_shared() {
  dc up -d --wait postgres-tickets postgres-assets rabbitmq mailpit
}

# Sobe a cor (e o que ela precisa), espera ficar saudável e testa ponta a ponta pelo nginx dela.
start_color() {
  local color=$1
  log "subindo $color com a versão $(tag_of "$color")"
  # shellcheck disable=SC2046
  dc up -d --wait --wait-timeout 300 $(services "$color")
  dc exec -T "web-$color" wget -qO- http://127.0.0.1/api/health > /dev/null
  dc exec -T "web-$color" wget -qO- http://127.0.0.1/api/sectors > /dev/null # passa pelo gateway e chega no asset-service
  log "$color saudável"
}

# Aponta a borda para a cor e recarrega o nginx sem derrubar conexões.
switch_to() {
  local color=$1
  printf 'upstream app {\n  server web-%s:80;\n  keepalive 64;\n}\n' "$color" > state/active.conf.new
  mv state/active.conf.new state/active.conf
  if [ -n "$(dc ps -q --status running edge)" ]; then
    dc exec -T edge nginx -t -q
    dc exec -T edge nginx -s reload
  else
    dc up -d --wait edge
  fi
  ACTIVE=$color
  save
  log "tráfego agora vai para $color"
}

stop_color() {
  local color=$1
  log "esperando ${DRAIN}s para as requisições em andamento terminarem em $color"
  sleep "$DRAIN"
  # shellcheck disable=SC2046
  dc stop $(services "$color")
  log "$color parada (containers mantidos para o rollback)"
}

case "${1:-}" in
  status)
    echo "ativa: ${ACTIVE:-nenhuma} · azul: $BLUE_TAG · verde: $GREEN_TAG · worker: $WORKER_TAG"
    ;;
  rollback)
    [ -n "$ACTIVE" ] || { echo "Nada para desfazer: ainda não houve deploy."; exit 1; }
    previous=$(other "$ACTIVE")
    [ "$(tag_of "$previous")" != none ] || { echo "A cor $previous nunca recebeu uma versão."; exit 1; }
    old=$ACTIVE
    start_shared
    start_color "$previous"
    switch_to "$previous"
    WORKER_TAG=$(tag_of "$previous"); save
    dc up -d --wait notification-worker
    stop_color "$old"
    ;;
  ''|-*)
    sed -n '2,6p' "$0"; exit 1
    ;;
  *)
    tag=$1
    target=blue; [ "$ACTIVE" = blue ] && target=green
    if [ "$target" = blue ]; then BLUE_TAG=$tag; else GREEN_TAG=$tag; fi
    save
    old=$ACTIVE
    start_shared
    start_color "$target"   # as migrações do Prisma rodam aqui, com a versão antiga ainda no ar (ADR 0008)
    switch_to "$target"
    WORKER_TAG=$tag; save
    dc up -d --wait notification-worker
    [ -n "$old" ] && stop_color "$old"
    log "deploy de $tag concluído"
    ;;
esac
