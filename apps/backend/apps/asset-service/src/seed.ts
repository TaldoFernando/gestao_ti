import { PrismaClient } from '.prisma/asset';

// Dados de exemplo do protótipo (app.js). Só roda com o banco vazio.
// ponytail: seed no boot, trocar por `prisma db seed` se a carga crescer.
export async function seed(db: PrismaClient) {
  if (await db.sector.count()) return;

  const educacao = await db.sector.create({ data: { name: 'Secretaria Municipal de Educação', type: 'Secretaria' } });
  const saude = await db.sector.create({ data: { name: 'Secretaria Municipal de Saúde', type: 'Secretaria' } });
  const adm = await db.sector.create({ data: { name: 'Secretaria de Administração', type: 'Secretaria' } });
  const escola = await db.sector.create({ data: { name: 'Escola Municipal Central', type: 'Escola', parentId: educacao.id } });
  const ubs = await db.sector.create({ data: { name: 'UBS Central', type: 'Unidade de saúde', parentId: saude.id } });
  await db.sector.create({ data: { name: 'Hospital Municipal', type: 'Hospital', parentId: saude.id } });

  await db.equipment.createMany({
    data: [
      { name: 'Computador Dell OptiPlex', type: 'Computador', assetTag: 'PAT-00125', serial: 'DL-7K2A91', sectorId: escola.id },
      { name: 'Monitor Dell 24 polegadas', type: 'Monitor', assetTag: 'PAT-00126', serial: 'MN-23901', sectorId: escola.id },
      { name: 'Impressora HP LaserJet', type: 'Impressora', assetTag: 'PAT-00201', serial: 'HP-LJ-5512', sectorId: ubs.id },
      { name: 'Notebook Lenovo ThinkPad', type: 'Notebook', assetTag: 'PAT-00311', serial: 'LN-8840Q', sectorId: adm.id },
    ],
  });
}
