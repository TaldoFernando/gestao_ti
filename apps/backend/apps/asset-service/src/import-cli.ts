import { readFileSync } from 'node:fs';
import { PrismaClient } from '.prisma/asset';
import { readAssets, importAssets } from './import-assets';

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file || (flag && flag !== '--apply')) throw new Error('Uso: npm run import:assets -- arquivo.csv [--apply]. Sem --apply: simulação sem gravar.');
  const rows = readAssets(readFileSync(file, 'utf8'));
  const db = new PrismaClient();
  try {
    const report = await importAssets(db, rows, flag === '--apply');
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
