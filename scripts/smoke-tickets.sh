#!/usr/bin/env bash
# Teste de fumaça dos chamados via gateway. Uso: docker compose up -d && ./scripts/smoke-tickets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
JSON='content-type: application/json'
TMP=$(mktemp -d ./.smoke-XXXX); trap 'rm -r "$TMP"' EXIT
printf '\x89PNG\r\n\x1a\n' > "$TMP/foto.png"; printf 'MZ' > "$TMP/virus.exe"

# --- Cidadão (sem login)
SECTOR_JSON=$(curl -s $B/sectors | j "JSON.stringify(o.find(x=>x.parentId) ?? o[0])")
SECTOR=$(echo "$SECTOR_JSON" | j "o.id"); SECTOR_NAME=$(echo "$SECTOR_JSON" | j "o.name")
[ -n "$SECTOR" ] && echo "ok   formulário público lista setores"
P=$(curl -s -X POST $B/tickets -F requesterName=Maria -F email=maria@exemplo.com -F whatsapp=83999990000 \
  -F sectorId=$SECTOR -F equipmentTag=PAT-00201 -F title=Impressora-nao-liga -F description=Desde-ontem -F files=@"$TMP/foto.png;type=image/png" | j "o.protocol")
[[ $P =~ ^JAC-[A-Z2-9]{4}-[A-Z2-9]{4}$ ]] && echo "ok   chamado aberto sem login ($P)" || { echo "FAIL protocolo: $P"; exit 1; }
expect "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/tickets -F requesterName=X -F email=a@b.com -F whatsapp='83999990000' -F equipmentTag=PAT-99999 -F title=T -F description=D)" 400 "patrimônio inexistente é recusado"
expect "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/tickets -F requesterName=X -F email=ruim -F whatsapp=1 -F title=T -F description=D)" 400 "validação do formulário"
expect "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/tickets -F requesterName=X -F email=a@b.com -F whatsapp='83999990000' -F title=T -F description=D -F files=@"$TMP/virus.exe;type=application/x-msdownload")" 400 "anexo de tipo proibido"
PUB=$(curl -s $B/tickets/protocol/${P,,})
expect "$(echo "$PUB" | j "o.status+'|'+o.sectorName")" "ABERTO|$SECTOR_NAME" "acompanhamento pelo protocolo (minúsculas aceitas)"
expect "$(echo "$PUB" | j "'email' in o || 'whatsapp' in o")" false "consulta pública não expõe dados pessoais"
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/tickets)" 401 "fila exige login"

# --- Técnico
T=$(curl -s -X POST $B/auth/login -H "$JSON" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | j "o.token")
c() { curl -s -H "Authorization: Bearer $T" "$@"; }
ID=$(c "$B/tickets?q=$P" | j "o[0].id")
EQ=$(c "$B/equipment?q=PAT-00201" | j "o[0].id")
expect "$(c $B/tickets/$ID | j "o.equipmentId+'|'+o.equipmentTag")" "$EQ|PAT-00201" "chamado ligado ao equipamento do inventário"
expect "$(c "$B/tickets?equipmentId=$EQ&status=" | j "o.some(t=>t.id==='$ID')")" true "histórico do equipamento lista o chamado"
expect "$(c -X PATCH $B/tickets/$ID -H "$JSON" -d '{"assignee":"me","priority":"ALTA"}' | j "o.status+'|'+o.assigneeName+'|'+o.priority")" "EM_ATENDIMENTO|Administrador|ALTA" "assumir chamado coloca em atendimento"
c -o /dev/null -X POST $B/tickets/$ID/events -H "$JSON" -d '{"message":"Trocamos o cabo de energia.","public":true}'
c -o /dev/null -X POST $B/tickets/$ID/events -H "$JSON" -d '{"message":"Cabo veio do almoxarifado.","public":false}'
c -o /dev/null -X PATCH $B/tickets/$ID -H "$JSON" -d '{"status":"RESOLVIDO"}'
PUB=$(curl -s $B/tickets/protocol/$P)
expect "$(echo "$PUB" | j "o.status")" RESOLVIDO "cidadão vê o status atualizado"
expect "$(echo "$PUB" | j "o.events.some(e=>e.message.includes('cabo de energia'))")" true "cidadão vê a resposta pública"
expect "$(echo "$PUB" | j "o.events.some(e=>e.message.includes('almoxarifado') || e.message.includes('assumiu'))")" false "cidadão não vê notas internas"
ATT=$(c $B/tickets/$ID | j "o.attachments[0].id")
expect "$(c -o /dev/null -w '%{http_code}' $B/tickets/$ID/attachments/$ATT)" 200 "técnico baixa o anexo"
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/tickets/$ID/attachments/$ATT)" 401 "anexo exige login"
