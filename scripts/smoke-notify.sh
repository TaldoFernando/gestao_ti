#!/usr/bin/env bash
# Resiliência das notificações (outbox + retry + DLQ). Para e religa containers: rode só em ambiente local.
# Uso: docker compose up -d && ./scripts/smoke-notify.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
MAILPIT=http://localhost:8025/api/v1
RABBIT="http://localhost:15672/api/queues/%2F"
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
open_ticket() { curl -s -X POST $B/tickets -F requesterName=Teste -F email="$1" -F whatsapp=83999990000 -F title=Teste-notificacao -F description=D | j "o.protocol"; }
mails_to() { curl -s "$MAILPIT/search?query=to:$1" | j "o.messages_count"; }
dlq_size() { curl -s -u "$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS" "$RABBIT/notifications.dlq" | j "o.messages ?? 0"; }
# Espera até $2 segundos por "$1" virar verdadeiro.
wait_for() { local end=$(( $(date +%s) + $2 )); until eval "$1"; do [ "$(date +%s)" -ge $end ] && return 1; sleep 2; done; }
RUN=$RANDOM

# 1. Caminho feliz
E1="feliz.$RUN@exemplo.com"; P=$(open_ticket $E1)
wait_for '[ "$(mails_to $E1)" = 1 ]' 30 && echo "ok   e-mail de abertura chega ($P)" || { echo "FAIL e-mail de abertura"; exit 1; }

# 2. Broker fora do ar: o chamado abre e o evento espera no outbox
docker compose stop rabbitmq >/dev/null 2>&1
E2="broker.$RUN@exemplo.com"; P=$(open_ticket $E2)
[[ $P == JAC-* ]] && echo "ok   chamado abre com o RabbitMQ parado ($P)"
sleep 5; expect "$(mails_to $E2)" 0 "nenhum e-mail enquanto o broker está fora"
docker compose start rabbitmq >/dev/null 2>&1
wait_for '[ "$(mails_to $E2)" = 1 ]' 90 && echo "ok   e-mail sai quando o broker volta (outbox)" || { echo "FAIL outbox não reenviou"; exit 1; }

# 3. SMTP fora do ar: 3 tentativas com espera de 10s, depois DLQ
BEFORE=$(dlq_size)
docker compose stop mailpit >/dev/null 2>&1
E3="smtp.$RUN@exemplo.com"; P=$(open_ticket $E3)
wait_for '[ "$(dlq_size)" -gt "$BEFORE" ]' 90 && echo "ok   após 3 falhas a mensagem vai para a DLQ" || { echo "FAIL DLQ"; docker compose start mailpit >/dev/null; exit 1; }
docker compose start mailpit >/dev/null 2>&1
docker compose logs --since 2m notification-worker 2>&1 | grep -q "tentativa 2/3" && echo "ok   retry registrado no log do worker"

# 4. Inventário fora do ar: o chamado abre mesmo assim (isolamento de falhas, ADR 0001)
SECTOR=$(curl -s $B/sectors | j "o[0].id")
docker compose stop asset-service >/dev/null 2>&1
P=$(curl -s -X POST $B/tickets -F requesterName=Teste -F email=asset.$RUN@exemplo.com -F whatsapp=83999990000 -F sectorId=$SECTOR -F equipmentTag=PAT-00201 -F title=Teste-isolamento -F description=D | j "o.protocol")
[[ $P == JAC-* ]] && echo "ok   chamado abre com o inventário parado, mesmo com patrimônio ($P)" || { echo "FAIL isolamento: $P"; docker compose start asset-service >/dev/null; exit 1; }
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/sectors)" 503 "gateway responde 503 para o inventário em vez de cair"
docker compose start asset-service >/dev/null 2>&1
wait_for '[ "$(curl -s -o /dev/null -w "%{http_code}" $B/sectors)" = 200 ]' 90 && echo "ok   inventário volta sozinho"
