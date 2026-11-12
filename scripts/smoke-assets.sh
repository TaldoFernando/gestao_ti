#!/usr/bin/env bash
# Teste de fumaça via gateway. Uso: docker compose up -d && ./scripts/smoke-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
JSON='content-type: application/json'

# --- Autenticação
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/equipment)" 401 "inventário exige login"
expect "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H "$JSON" -d '{"email":"x@x.com","password":"errada"}')" 401 "senha errada"
T=$(curl -s -X POST $B/auth/login -H "$JSON" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | j "o.token")
c() { curl -s -H "Authorization: Bearer $T" "$@"; }
code() { c -o /dev/null -w "%{http_code}" "$@"; }
expect "$(code $B/equipment)" 200 "técnico logado lê inventário"
expect "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-user-role: TECNICO' $B/equipment)" 401 "cabeçalho forjado não autentica"

# --- Perfil responsável (só leitura)
EMAIL="resp.$RANDOM@prefeitura.example"
c -o /dev/null -X POST $B/users -H "$JSON" -d "{\"name\":\"Resp\",\"email\":\"$EMAIL\",\"password\":\"senha-forte-1\",\"role\":\"RESPONSAVEL\"}"
TR=$(curl -s -X POST $B/auth/login -H "$JSON" -d "{\"email\":\"$EMAIL\",\"password\":\"senha-forte-1\"}" | j "o.token")
expect "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TR" $B/equipment)" 200 "responsável lê inventário"
expect "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TR" -X POST $B/equipment -H "$JSON" -d '{"name":"X","type":"Y"}')" 403 "responsável não cadastra"

# --- Regras do inventário
SAUDE=$(c $B/sectors | j "o.find(x=>x.name.includes('Saúde')).id")
ADM=$(c $B/sectors | j "o.find(x=>x.name.includes('Administração')).id")
expect "$(c "$B/equipment?sectorId=$SAUDE" | j "o.length")" 1 "filtro por setor inclui locais vinculados"
expect "$(code -X DELETE $B/sectors/$SAUDE)" 409 "setor com locais não pode ser excluído"
expect "$(code -X POST $B/equipment -H "$JSON" -d '{"name":"X","type":"Monitor","assetTag":"PAT-00125"}')" 409 "patrimônio duplicado"
expect "$(code -X POST $B/equipment -H "$JSON" -d '{"name":"","type":"Monitor"}')" 400 "validação de entrada"
LOC=$(c -X POST $B/sectors -H "$JSON" -d "{\"name\":\"Smoke\",\"type\":\"Departamento\",\"parentId\":\"$ADM\"}" | j "o.id")
EQ=$(c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"Smoke\",\"type\":\"Monitor\",\"sectorId\":\"$LOC\"}" | j "o.id")
expect "$(code -X DELETE $B/sectors/$LOC)" 204 "excluir local"
expect "$(c $B/equipment/$EQ | j "o.sectorId")" null "equipamento fica sem setor"
expect "$(code -X DELETE $B/equipment/$EQ)" 204 "excluir equipamento"

# --- Rate limit (por último: bloqueia o login deste IP por 1 minuto)
for i in 1 2 3 4 5 6; do last=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H "$JSON" -d '{"email":"x@x.com","password":"x"}'); done
expect "$last" 429 "login bloqueado após 5 tentativas por minuto"
