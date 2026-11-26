#!/usr/bin/env bash
# Observabilidade (issue #14): o Prometheus coleta os serviços e o RabbitMQ, e o Grafana sobe com o painel.
# Uso: docker compose up -d && ./scripts/smoke-metrics.sh   (no CI roda depois do smoke-notify)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
P=${PROMETHEUS_URL:-http://localhost:9090}
G=${GRAFANA_URL:-http://localhost:3001}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
# Resultado numérico de uma consulta PromQL (0 se não houver série).
q() { curl -s -G "$P/api/v1/query" --data-urlencode "query=$1" | j "Number((o.data.result[0]||{value:[0,0]}).value[1])"; }
# A coleta é a cada 5 s: repete por até 2 min antes de dar como falha.
eventually() { for _ in $(seq 1 24); do [ "$(eval "$1")" = "$2" ] && break; sleep 5; done; expect "$(eval "$1")" "$2" "$3"; }
grafana() { curl -s -u "admin:${GRAFANA_ADMIN_PASSWORD:-troque-esta-senha}" "$G$1"; }

# Tráfego pelo gateway numa rota pública.
for _ in $(seq 1 10); do curl -s -o /dev/null -H 'X-Requested-With: gestao-ti' "$B/sectors"; done

eventually "curl -s $P/api/v1/targets | j \"o.data.activeTargets.filter(t=>t.health==='up').length\"" 5 "Prometheus coleta os 4 serviços e o RabbitMQ"
eventually "q 'sum(http_requests_total{service=\"gateway\",route=\"/api/sectors\"}) >= bool 10'" 1 "gateway conta as requisições por rota"
expect "$(q 'sum(http_requests_total{service="asset-service",route="/api/sectors"}) >= bool 10')" 1 "o asset-service também (a chamada passou do gateway para ele)"
expect "$(q 'count(http_request_duration_seconds_bucket{service="gateway"}) > bool 0')" 1 "latência medida no histograma"
expect "$(q 'count(rabbitmq_detailed_queue_messages_ready{queue=~"notifications.*"})')" 3 "tamanho das 3 filas: principal, retry e DLQ"
expect "$(q 'count(notifications_processed_total) > bool 0')" 1 "worker conta as notificações processadas"
expect "$(q 'count(http_requests_total{route="/api/health"})')" 0 "healthcheck do Docker fica fora das métricas"
# As métricas ficam só na porta interna 9464: pelo nginx/gateway não há rota de métricas.
expect "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Requested-With: gestao-ti' "$B/metrics")" 401 "métricas não ficam públicas pelo gateway"

expect "$(curl -s "$G/api/health" | j 'o.database')" ok "Grafana no ar"
expect "$(grafana /api/datasources/uid/prometheus/health | j 'o.status')" OK "Grafana conversa com o Prometheus"
expect "$(grafana /api/dashboards/uid/gestao-ti | j 'o.dashboard.panels.length')" 12 "painel provisionado com os 12 gráficos"
expect "$(curl -s -o /dev/null -w '%{http_code}' "$G/api/dashboards/uid/gestao-ti")" 200 "painel abre sem login (só leitura)"
