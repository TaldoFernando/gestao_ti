#!/usr/bin/env bash
# Escopo do responsável do setor e histórico de movimentações. Uso: docker compose up -d && ./scripts/smoke-scope.sh
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
EDU=$(c $B/sectors | j "o.find(x=>x.name.includes('Educação')).id")
ESCOLA=$(c $B/sectors | j "o.find(x=>x.name==='Escola Municipal Central').id")
ADM=$(c $B/sectors | j "o.find(x=>x.name.includes('Administração')).id")
IMPRESSORA=$(c "$B/equipment?q=LaserJet" | j "o[0].id")

# Responsável da Secretaria de Educação (setor principal: vê também a escola vinculada)
EMAIL="edu.$RANDOM@prefeitura.example"
c -o /dev/null -X POST $B/users -H "$JSON" -d "{\"name\":\"Resp Edu\",\"email\":\"$EMAIL\",\"password\":\"senha-forte-1\",\"role\":\"RESPONSAVEL\",\"sectorId\":\"$EDU\"}"
TR=$(login "$EMAIL" senha-forte-1)
r() { curl -s -H "Authorization: Bearer $TR" "$@"; }
VISIVEIS=$(r $B/equipment | j "o.length"); TOTAL=$(c $B/equipment | j "o.length")
[ "$VISIVEIS" -lt "$TOTAL" ] && echo "ok   responsável vê $VISIVEIS de $TOTAL equipamentos"
expect "$(r $B/equipment | j "o.every(e=>['$EDU','$ESCOLA'].includes(e.sectorId))")" true "só equipamentos da Educação e locais vinculados"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$IMPRESSORA)" 404 "equipamento de outro setor não abre por id"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$IMPRESSORA/movements)" 404 "nem o histórico dele"
expect "$(r -o /dev/null -w '%{http_code}' "$B/equipment?sectorId=$(c $B/sectors | j "o.find(x=>x.name==='UBS Central').id")")" 200 "filtrar por setor alheio não vaza nada..."
expect "$(r "$B/equipment?sectorId=$(c $B/sectors | j "o.find(x=>x.name==='UBS Central').id")" | j "o.length")" 0 "...retorna lista vazia"

# Movimentação: mover registra origem, destino e autor; mover de volta registra de novo
ID=$(c -X POST $B/equipment -H "$JSON" -d "{\"name\":\"Monitor movido\",\"type\":\"Monitor\",\"sectorId\":\"$ESCOLA\"}" | j "o.id")
c -o /dev/null -X PATCH $B/equipment/$ID -H "$JSON" -d "{\"sectorId\":\"$ADM\"}"
c -o /dev/null -X PATCH $B/equipment/$ID -H "$JSON" -d '{"name":"Monitor movido (renomeado)"}'
M=$(c $B/equipment/$ID/movements)
expect "$(echo "$M" | j "o.length")" 2 "cadastro + 1 mudança de local (renomear não conta)"
expect "$(echo "$M" | j "o[0].fromName+' -> '+o[0].toName")" "Secretaria Municipal de Educação › Escola Municipal Central -> Secretaria de Administração" "origem e destino com caminho completo"
expect "$(echo "$M" | j "o[0].byName")" Administrador "autor registrado"
expect "$(r -o /dev/null -w '%{http_code}' $B/equipment/$ID)" 404 "saiu do setor do responsável → some para ele"
c -o /dev/null -X DELETE $B/equipment/$ID
