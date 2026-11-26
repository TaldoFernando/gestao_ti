#!/usr/bin/env bash
# Verifica limitador compartilhado entre gateways e publishers do outbox concorrentes.
set -euo pipefail
cd "$(dirname "$0")/.."

gateway_ids=($(docker compose ps -q gateway))
ticket_ids=($(docker compose ps -q ticket-service))
if [ "${#gateway_ids[@]}" -lt 2 ] || [ "${#ticket_ids[@]}" -lt 2 ]; then
  echo "FAIL esperado ao menos 2 gateways e 2 ticket-services"
  exit 1
fi

network=$(docker inspect -f '{{range $name, $value := .NetworkSettings.Networks}}{{$name}}{{end}}' "$(docker compose ps -q web | head -n 1)")
gateway_ips=()
for id in "${gateway_ids[@]}"; do
  gateway_ips+=("$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$id")")
done
ticket_ips=()
for id in "${ticket_ids[@]}"; do
  ticket_ips+=("$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$id")")
done

docker run --rm --network "$network" \
  -e GATEWAY_A="${gateway_ips[0]}" \
  -e GATEWAY_B="${gateway_ips[1]}" \
  -e TICKET_A="${ticket_ips[0]}" \
  -e TICKET_B="${ticket_ips[1]}" \
  -v "$PWD/scripts/test-replicas.cjs:/test-replicas.cjs:ro" \
  node:22-alpine node /test-replicas.cjs
