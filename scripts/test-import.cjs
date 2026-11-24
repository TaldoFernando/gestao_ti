// Executado no container asset-service contra o banco de teste do Compose.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('.prisma/asset');
const { importAssets, readAssets } = require('/app/dist/apps/asset-service/src/import-assets.js');
const db = new PrismaClient();
(async () => {
  const tag = `SMOKE-${randomUUID().slice(0, 12)}`;
  const root = `Importação smoke ${tag}`;
  const rows = readAssets(`assetTag;name;type;sector;sectorType;local;localType\n${tag};PC;Computador;${root};Secretaria;Sala;Departamento`);
  try {
    const preview = await importAssets(db, rows);
    assert.equal(preview.created, 1); assert.deepEqual(preview.errors, []);
    assert.equal(await db.equipment.count({ where: { assetTag: tag } }), 0);
    assert.equal(await db.sector.count({ where: { name: root } }), 0);
    const first = await importAssets(db, rows, true);
    assert.equal(first.created, 1); assert.deepEqual(first.errors, []);
    const repeat = await importAssets(db, rows, true);
    assert.equal(repeat.skipped, 1); assert.equal(repeat.created, 0);
    assert.equal(await db.equipment.count({ where: { assetTag: tag } }), 1);
    const duplicate = await importAssets(db, [rows[0], rows[0]], true);
    assert.equal(duplicate.errors[0].line, 3);
    const conflict = await importAssets(db, [{ ...rows[0], name: 'Alterado' }], true);
    assert.match(conflict.errors[0].message, /dados diferentes/);
    const unknown = await importAssets(db, [{ ...rows[0], assetTag: `${tag}-2`, sector: `${root}-desconhecido`, sectorType: '' }], true);
    assert.match(unknown.errors[0].message, /desconhecido/);
    // Setor criado na transação de uma linha que falha também precisa ser revertido.
    const rollback = await importAssets(db, [{ ...rows[0], sector: `${root}-rollback` }], true);
    assert.equal(rollback.errors.length, 1);
    assert.equal(await db.sector.count({ where: { name: `${root}-rollback` } }), 0);
    console.log('ok   importação: simulação, aplicação, repetição, duplicados, conflito e rollback');
  } finally {
    await db.equipment.deleteMany({ where: { assetTag: { startsWith: tag } } });
    const roots = await db.sector.findMany({ where: { name: { startsWith: root } } });
    await db.sector.deleteMany({ where: { parentId: { in: roots.map((s) => s.id) } } });
    await db.sector.deleteMany({ where: { id: { in: roots.map((s) => s.id) } } });
    await db.$disconnect();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
