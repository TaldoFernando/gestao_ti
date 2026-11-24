import { parse } from 'csv-parse/sync';
import type { PrismaClient, Prisma } from '.prisma/asset';

export type AssetRow = { assetTag: string; name: string; type: string; serial: string; ownership: 'PROPRIO' | 'ALUGADO'; sector: string; sectorType: string; local: string; localType: string };
const columns = ['assetTag', 'name', 'type', 'serial', 'ownership', 'sector', 'sectorType', 'local', 'localType'];
export function readAssets(csv: string): AssetRow[] {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  const records = parse(csv, { bom: true, delimiter: firstLine.includes(';') ? ';' : ',', columns: (header: string[]) => {
    if (header.some((key) => !columns.includes(key.trim())) || !['assetTag', 'name', 'type', 'sector'].every((key) => header.map((h) => h.trim()).includes(key)) || new Set(header).size !== header.length) throw new Error('Cabeçalho inválido. Use o modelo de docs/importacao-patrimonio.csv.');
    return header.map((h) => h.trim());
  }, skip_empty_lines: true, trim: true, max_record_size: 20_000 }) as Record<string, string>[];
  return records.map((row) => Object.fromEntries(columns.map((key) => [key, row[key] ?? ''])) as AssetRow);
}

export function validateRow(row: AssetRow) {
  for (const [field, max] of [['assetTag', 40], ['name', 80], ['type', 50], ['serial', 60], ['sector', 80], ['sectorType', 50], ['local', 80], ['localType', 50]] as const) {
    if (row[field].length > max) throw new Error(`${field}: máximo de ${max} caracteres.`);
  }
  for (const field of ['assetTag', 'name', 'type', 'sector'] as const) if (!row[field]) throw new Error(`${field}: obrigatório.`);
  if (row.ownership && !['PROPRIO', 'ALUGADO'].includes(row.ownership)) throw new Error('ownership: use PROPRIO ou ALUGADO.');
}

async function sector(tx: Prisma.TransactionClient, name: string, type: string, parentId: string | null) {
  const found = await tx.sector.findMany({ where: { name: { equals: name, mode: 'insensitive' }, parentId } });
  if (found.length > 1) throw new Error(`Setor/local ambíguo: ${name}.`);
  if (found[0]) {
    if (type && found[0].type !== type) throw new Error(`Tipo do setor/local diferente do cadastro: ${name}.`);
    return found[0];
  }
  if (!type) throw new Error(`Setor/local desconhecido: ${name}. Informe o tipo para criá-lo.`);
  return tx.sector.create({ data: { name, type, parentId } });
}

class Preview extends Error { constructor(readonly result: 'created' | 'skipped') { super('preview'); } }
export async function importAssets(db: PrismaClient, rows: AssetRow[], apply = false) {
  const report = { mode: apply ? 'apply' : 'preview', created: 0, skipped: 0, errors: [] as { line: number; message: string }[] };
  const tags = new Set<string>();
  for (const [index, row] of rows.entries()) {
    try {
      validateRow(row);
      const key = row.assetTag.toLocaleUpperCase('pt-BR');
      if (tags.has(key)) throw new Error('Patrimônio repetido no CSV.');
      tags.add(key);
      const result = await db.$transaction(async (tx) => {
        // Serializa importações concorrentes, inclusive a criação de setores.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(194019)`;
        const root = await sector(tx, row.sector, row.sectorType, null);
        const dest = row.local ? await sector(tx, row.local, row.localType, root.id) : root;
        const existing = await tx.equipment.findMany({ where: { assetTag: { equals: row.assetTag, mode: 'insensitive' } } });
        const data = { name: row.name, type: row.type, serial: row.serial || null, ownership: row.ownership || 'PROPRIO' as const, sectorId: dest.id };
        let outcome: 'created' | 'skipped' = 'created';
        if (existing.length) {
          if (existing.length !== 1 || Object.entries(data).some(([field, value]) => existing[0][field as keyof typeof existing[0]] !== value)) throw new Error('Patrimônio já cadastrado com dados diferentes. Revise antes de importar.');
          outcome = 'skipped';
        } else {
          await tx.equipment.create({ data: { ...data, assetTag: row.assetTag, movements: { create: { fromName: null, toName: row.local ? `${root.name} › ${dest.name}` : root.name, byName: 'Importação CSV' } } } });
        }
        if (!apply) throw new Preview(outcome);
        return outcome;
      });
      report[result]++;
    } catch (error) {
      if (error instanceof Preview) report[error.result]++;
      else report.errors.push({ line: index + 2, message: (error as Error).message });
    }
  }
  return report;
}
