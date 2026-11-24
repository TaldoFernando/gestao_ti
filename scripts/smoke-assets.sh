#!/usr/bin/env bash
# Teste de fumaça via gateway. Uso: docker compose up -d && ./scripts/smoke-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
# Proteção CSRF: cabeçalho não simples também em chamadas multipart públicas.
curl() { command curl -H 'X-Requested-With: gestao-ti' "$@"; }
login_cookie() {
  local jar
  jar=$(mktemp)
  curl -s -c "$jar" -X POST "$B/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" -o /dev/null
  awk '$6 == "ti-session" {print $7}' "$jar"
  rm -f "$jar"
}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
JSON='content-type: application/json'

# --- Autenticação
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/equipment)" 401 "inventário exige login"
expect "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H "$JSON" -d '{"email":"x@x.com","password":"errada"}')" 401 "senha errada"
T=$(login_cookie "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
c() { curl -s -H "Cookie: ti-session=$T" "$@"; }
code() { c -o /dev/null -w "%{http_code}" "$@"; }
expect "$(code $B/equipment)" 200 "técnico logado lê inventário"
expect "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-user-role: TECNICO' $B/equipment)" 401 "cabeçalho forjado não autentica"

# --- Perfil responsável (só leitura)
EMAIL="resp.$RANDOM@prefeitura.example"
c -o /dev/null -X POST $B/users -H "$JSON" -d "{\"name\":\"Resp\",\"email\":\"$EMAIL\",\"password\":\"senha-forte-1\",\"role\":\"RESPONSAVEL\"}"
TR=$(login_cookie "$EMAIL" "senha-forte-1")
expect "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: ti-session=$TR" $B/equipment)" 200 "responsável lê inventário"
expect "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: ti-session=$TR" -X POST $B/equipment -H "$JSON" -d '{"name":"X","type":"Y"}')" 403 "responsável não cadastra"

# --- Regras do inventário
# Cria os próprios setores e equipamentos: não depende dos dados de exemplo, que podem ter sido alterados.
ROOT=$(c -X POST $B/sectors -H "$JSON" -d '{"name":"Smoke principal","type":"Secretaria"}' | j "o.id")
ADM=$ROOT
CHILD=$(c -X POST $B/sectors -H "$JSON" -d "{\"name\":\"Smoke filho\",\"type\":\"Escola\",\"parentId\":\"$ROOT\"}" | j "o.id")
IN_CHILD=$(c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"Smoke no filho\",\"type\":\"Monitor\",\"sectorId\":\"$CHILD\"}" | j "o.id")
expect "$(c "$B/equipment?sectorId=$ROOT" | j "o.length")" 1 "filtro por setor inclui locais vinculados"
expect "$(code -X DELETE $B/sectors/$ROOT)" 409 "setor com locais não pode ser excluído"
c -o /dev/null -X DELETE $B/equipment/$IN_CHILD
TAG="PAT-SMOKE-$RANDOM"
DUP=$(c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"Smoke original\",\"type\":\"Monitor\",\"assetTag\":\"$TAG\"}" | j "o.id")
# Evita expansão de chaves do Bash 3 em JSON dentro de substituição aninhada.
DUPLICATE_JSON="{\"name\":\"Smoke copia\",\"type\":\"Monitor\",\"assetTag\":\"$TAG\"}"
expect "$(code -X POST $B/equipment -H "$JSON" -d "$DUPLICATE_JSON")" 409 "patrimônio duplicado"
c -o /dev/null -X DELETE $B/equipment/$DUP
expect "$(code -X POST $B/equipment -H "$JSON" -d '{"name":"","type":"Monitor"}')" 400 "validação de entrada"
LOC=$(c -X POST $B/sectors -H "$JSON" -d "{\"name\":\"Smoke\",\"type\":\"Departamento\",\"parentId\":\"$ADM\"}" | j "o.id")
EQ=$(c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"Smoke\",\"type\":\"Monitor\",\"sectorId\":\"$LOC\"}" | j "o.id")
expect "$(code -X DELETE $B/sectors/$LOC)" 204 "excluir local"
expect "$(c $B/equipment/$EQ | j "o.sectorId")" null "equipamento fica sem setor"
expect "$(code -X DELETE $B/equipment/$EQ)" 204 "excluir equipamento"
c -o /dev/null -X DELETE $B/sectors/$CHILD; c -o /dev/null -X DELETE $B/sectors/$ROOT

# --- Rate limit (por último: bloqueia o login deste IP por 1 minuto)
for i in 1 2 3 4 5 6; do last=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H "$JSON" -d '{"email":"x@x.com","password":"x"}'); done
expect "$last" 429 "login bloqueado após 5 tentativas por minuto"
