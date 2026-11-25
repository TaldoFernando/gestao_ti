#!/usr/bin/env bash
# Migrações compatíveis com duas versões no ar ao mesmo tempo (blue-green, ADR 0008).
# A versão nova aplica as migrações enquanto a antiga ainda atende; então uma migração só pode *expandir*
# o banco (tabela nova, coluna opcional, índice). Apagar, renomear ou tornar obrigatório quebra a versão
# antiga: isso fica para uma migração de *contração*, num deploy seguinte, marcada no topo com
#   -- contract: <por que já é seguro>
# Uso: ./scripts/check-migrations.sh [pasta...]   (padrão: as migrações dos dois serviços)
set -uo pipefail
cd "$(dirname "$0")/.."
dirs=("$@"); [ ${#dirs[@]} -gt 0 ] || dirs=(apps/backend/apps/*/prisma/migrations)
RISKY='DROP[[:space:]]+(COLUMN|TABLE)|RENAME|SET[[:space:]]+NOT[[:space:]]+NULL|ALTER[[:space:]]+COLUMN[^;]*TYPE|ADD[[:space:]]+COLUMN[^;]*NOT[[:space:]]+NULL'
fail=0
for file in $(find "${dirs[@]}" -name migration.sql | sort); do
  if head -n 3 "$file" | grep -qi -- '-- contract:'; then echo "ok   $file (contração autorizada)"; continue; fi
  # NOT NULL com DEFAULT é seguro: a versão antiga não manda o campo e o banco preenche.
  bad=$(grep -n -i -E "$RISKY" "$file" | grep -v -i 'DEFAULT' || true)
  if [ -n "$bad" ]; then
    echo "FAIL $file quebra a versão que ainda está no ar:"; echo "$bad" | sed 's/^/       /'; fail=1
  else
    echo "ok   $file"
  fi
done
exit $fail
