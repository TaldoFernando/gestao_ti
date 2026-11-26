#!/usr/bin/env bash
# Constrói a imagem de cada serviço e publica no GitHub Container Registry (issue #17).
# Uso: IMAGE_PREFIX=ghcr.io/<dono>/gestao_ti TAGS="sha-abc1234 refactor-fullstack" deploy/publish.sh [--no-push]
# Gera <prefixo>-gateway, -ticket-service, -asset-service, -notification-worker e -web, cada uma com todas as TAGS.
set -euo pipefail
cd "$(dirname "$0")/.."
PREFIX=$(echo "${IMAGE_PREFIX:?defina IMAGE_PREFIX}" | tr '[:upper:]' '[:lower:]') # o registry só aceita minúsculas
read -ra TAGS <<< "${TAGS:?defina TAGS}"

for app in gateway ticket-service asset-service notification-worker web; do
  if [ "$app" = web ]; then ctx=apps/web; args=(); else ctx=apps/backend; args=(--build-arg "APP=$app"); fi
  names=(); for t in "${TAGS[@]}"; do names+=(-t "$PREFIX-$app:$t"); done
  docker build "${args[@]}" "${names[@]}" "$ctx"
  if [ "${1:-}" != --no-push ]; then for t in "${TAGS[@]}"; do docker push "$PREFIX-$app:$t"; done; fi
done
