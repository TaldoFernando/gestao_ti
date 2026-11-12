#!/usr/bin/env bash
# Teste de fumaça do inventário via gateway. Uso: docker compose up -d && ./scripts/smoke-assets.sh
set -euo pipefail
B=${BASE_URL:-http://localhost:8080/api}
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'null');console.log($1)})"; }
expect() { [ "$1" = "$2" ] && echo "ok   $3" || { echo "FAIL $3 (esperado $2, veio $1)"; exit 1; }; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

SAUDE=$(curl -s $B/sectors | j "o.find(x=>x.name.includes('Saúde')).id")
ADM=$(curl -s $B/sectors | j "o.find(x=>x.name.includes('Administração')).id")

expect "$(curl -s "$B/equipment?sectorId=$SAUDE" | j "o.length")" 1 "filtro por setor inclui locais vinculados"
expect "$(code -X DELETE $B/sectors/$SAUDE)" 409 "setor com locais não pode ser excluído"
expect "$(code -X POST $B/equipment -H 'content-type: application/json' -d '{"name":"X","type":"Monitor","assetTag":"PAT-00125"}')" 409 "patrimônio duplicado"
expect "$(code -X POST $B/equipment -H 'content-type: application/json' -d '{"name":"","type":"Monitor"}')" 400 "validação de entrada"

LOC=$(curl -s -X POST $B/sectors -H 'content-type: application/json' -d "{\"name\":\"Smoke\",\"type\":\"Departamento\",\"parentId\":\"$ADM\"}" | j "o.id")
EQ=$(curl -s -X POST $B/equipment -H 'content-type: application/json' -d "{\"name\":\"Smoke\",\"type\":\"Monitor\",\"sectorId\":\"$LOC\"}" | j "o.id")
expect "$(code -X DELETE $B/sectors/$LOC)" 204 "excluir local"
expect "$(curl -s $B/equipment/$EQ | j "o.sectorId")" null "equipamento fica sem setor"
expect "$(code -X DELETE $B/equipment/$EQ)" 204 "excluir equipamento"
