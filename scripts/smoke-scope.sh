#!/usr/bin/env bash
# Escopo do responsável do setor e histórico de movimentações. Uso: docker compose up -d && ./scripts/smoke-scope.sh
# Cria e apaga os próprios setores e equipamentos: não depende dos dados de exemplo.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
B=${BASE_URL:-http://localhost:8080/api}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
JSON='content-type: application/json'
login() { curl -s -X POST $B/auth/login -H "$JSON" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | j "o.token"; }

T=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
c() { curl -s -H "Authorization: Bearer $T" "$@"; }
new_sector() { c -X POST $B/sectors -H "$JSON" -d "$1" | j "o.id"; }
new_equipment() { c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"$1\",\"type\":\"Monitor\",\"sectorId\":\"$2\"}" | j "o.id"; }

R=$RANDOM
EDU=$(new_sector "{\"name\":\"Smoke Educacao $R\",\"type\":\"Secretaria\"}")
ESCOLA=$(new_sector "{\"name\":\"Smoke Escola $R\",\"type\":\"Escola\",\"parentId\":\"$EDU\"}")
SAUDE=$(new_sector "{\"name\":\"Smoke Saude $R\",\"type\":\"Secretaria\"}")
E1=$(new_equipment "Smoke na secretaria" $EDU)
E2=$(new_equipment "Smoke na escola" $ESCOLA)
ALHEIO=$(new_equipment "Smoke na saude" $SAUDE)
cleanup() { for id in $E1 $E2 $ALHEIO ${MOVED:-}; do c -o /dev/null -X DELETE $B/equipment/$id; done; for id in $ESCOLA $EDU $SAUDE; do c -o /dev/null -X DELETE $B/sectors/$id; done; }
trap cleanup EXIT

# Responsável da secretaria (setor principal: vê também a escola vinculada)
EMAIL="edu.$R@prefeitura.example"
c -o /dev/null -X POST $B/users -H "$JSON" -d "{\"name\":\"Resp Edu\",\"email\":\"$EMAIL\",\"password\":\"senha-forte-1\",\"role\":\"RESPONSAVEL\",\"sectorId\":\"$EDU\"}"
TR=$(login "$EMAIL" senha-forte-1)
r() { curl -s -H "Authorization: Bearer $TR" "$@"; }
expect "$(r $B/equipment | j "o.map(e=>e.id).sort().join()")" "$(printf '%s\n' $E1 $E2 | sort | paste -sd,)" "responsável vê exatamente a secretaria e a escola vinculada"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$ALHEIO)" 404 "equipamento de outro setor não abre por id"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$ALHEIO/movements)" 404 "nem o histórico dele"
expect "$(r -o /dev/null -w '%{http_code}' "$B/equipment?sectorId=$SAUDE")" 200 "filtrar por setor alheio não vaza nada..."
expect "$(r "$B/equipment?sectorId=$SAUDE" | j "o.length")" 0 "...retorna lista vazia"

# Termo de responsabilidade em PDF (issue #20): gerado no servidor, com o mesmo escopo do inventário
PDF=$(mktemp); trap 'rm -f $PDF; cleanup' EXIT
expect "$(r -o $PDF -w '%{http_code} %{content_type}' $B/sectors/$EDU/report.pdf)" "200 application/pdf" "responsável baixa o termo do próprio setor"
expect "$(head -c 5 $PDF)" "%PDF-" "o arquivo é um PDF"
expect "$(r -o /dev/null -w '%{http_code}' $B/sectors/$ESCOLA/report.pdf)" 200 "e o do local vinculado"
expect "$(r -o /dev/null -w '%{http_code}' $B/sectors/$SAUDE/report.pdf)" 404 "termo de outro setor não sai"
expect "$(c -o /dev/null -w '%{http_code}' $B/sectors/$SAUDE/report.pdf)" 200 "técnico gera o termo de qualquer setor"
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/sectors/$EDU/report.pdf)" 401 "sem login não gera termo"

# Movimentação: mover registra origem, destino e autor; renomear não registra
MOVED=$(new_equipment "Smoke movido" $ESCOLA)
c -o /dev/null -X PATCH $B/equipment/$MOVED -H "$JSON" -d "{\"sectorId\":\"$SAUDE\"}"
c -o /dev/null -X PATCH $B/equipment/$MOVED -H "$JSON" -d '{"name":"Smoke movido (renomeado)"}'
M=$(c $B/equipment/$MOVED/movements)
expect "$(echo "$M" | j "o.length")" 2 "cadastro + 1 mudança de local (renomear não conta)"
expect "$(echo "$M" | j "o[0].fromName+' -> '+o[0].toName")" "Smoke Educacao $R › Smoke Escola $R -> Smoke Saude $R" "origem e destino com caminho completo"
expect "$(echo "$M" | j "o[0].byName")" Administrador "autor registrado"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$MOVED)" 404 "saiu do setor do responsável → some para ele"
