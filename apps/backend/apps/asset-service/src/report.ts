import PDFDocument from 'pdfkit';

export type ReportItem = { assetTag: string | null; name: string; type: string; serial: string | null; ownership: 'PROPRIO' | 'ALUGADO'; local: string };
export type ReportInput = { sectorName: string; parentName: string | null; items: ReportItem[]; issuedAt: Date; number: string };

/** Nº do termo: TR-AAAAMMDD-HHMM-XXXX (data/hora de emissão + início do id do setor). */
export function reportNumber(sectorId: string, at: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  const local = new Date(at.toLocaleString('en-US', { timeZone: 'America/Fortaleza' }));
  const stamp = `${local.getFullYear()}${p(local.getMonth() + 1)}${p(local.getDate())}-${p(local.getHours())}${p(local.getMinutes())}`;
  return `TR-${stamp}-${sectorId.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

export function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'setor';
}

// Mesmas colunas do relatório da tela (apps/web/src/pages/Report.tsx). Larguras somam 515 (A4 menos margens de 40).
const MONO_SIZE = 8.5;
const COLUMNS: { title: string; width: number; value: (e: ReportItem) => string; mono?: boolean }[] = [
  { title: 'Patrimônio', width: 72, value: (e) => e.assetTag ?? '—', mono: true },
  { title: 'Equipamento', width: 145, value: (e) => e.name },
  { title: 'Tipo', width: 65, value: (e) => e.type },
  { title: 'Série', width: 70, value: (e) => e.serial ?? '—', mono: true },
  { title: 'Vínculo', width: 48, value: (e) => (e.ownership === 'ALUGADO' ? 'Alugado' : 'Próprio') },
  { title: 'Local', width: 115, value: (e) => e.local },
];

/** Termo de responsabilidade do setor em PDF (A4), com nº, data de emissão e campos de assinatura. */
export function buildReportPdf(r: ReportInput, compress = true): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, compress, bufferPages: true, info: { Title: `Termo de responsabilidade · ${r.sectorName}`, Author: 'Setor de TI · Prefeitura Municipal de Jacaraú' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Fortaleza' }).format(r.issuedAt);

  // Cabeçalho
  doc.font('Helvetica').fontSize(9).fillColor('#666').text('Prefeitura Municipal de Jacaraú · Setor de Tecnologia da Informação', left, 40);
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(18).fillColor('#000').text('Termo de responsabilidade');
  doc.moveDown(0.1).font('Helvetica').fontSize(11).fillColor('#444').text('Relação de equipamentos de TI');
  doc.moveDown(0.3).fontSize(13).fillColor('#000').text(`${r.parentName ? `${r.parentName} › ` : ''}${r.sectorName}`);
  doc.moveDown(0.4).fontSize(9).fillColor('#666')
    .text(`Nº ${r.number} · Emitido em ${date} · ${r.items.length} ${r.items.length === 1 ? 'item' : 'itens'}`);
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#000').stroke();
  doc.moveDown(0.8);

  // Tabela
  const header = () => {
    let x = left;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#666');
    for (const c of COLUMNS) {
      doc.text(c.title, x, y, { width: c.width - 6 });
      x += c.width;
    }
    doc.y = y + 14;
    doc.moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3).lineWidth(0.8).strokeColor('#000').stroke();
  };
  header();
  for (const e of r.items) {
    doc.fontSize(9);
    const heights = COLUMNS.map((c) => doc.font(c.mono ? 'Courier' : 'Helvetica').fontSize(c.mono ? MONO_SIZE : 9).heightOfString(c.value(e), { width: c.width - 6 }));
    const h = Math.max(...heights) + 8;
    if (doc.y + h > bottom()) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    let x = left;
    doc.fillColor('#000');
    for (const c of COLUMNS) {
      doc.font(c.mono ? 'Courier' : 'Helvetica').fontSize(c.mono ? MONO_SIZE : 9).text(c.value(e), x, y + 3, { width: c.width - 6 });
      x += c.width;
    }
    doc.y = y + h;
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.4).strokeColor('#ccc').stroke();
  }
  if (!r.items.length) doc.font('Helvetica').fontSize(10).fillColor('#666').text('Nenhum equipamento registrado neste setor.', left, doc.y + 20, { width, align: 'center' });

  // Assinaturas: sempre juntas, na mesma página
  let y = doc.y + 70;
  if (y + 40 > bottom()) {
    doc.addPage();
    y = doc.page.margins.top + 70;
  }
  const colW = (width - 60) / 2;
  ['Responsável pelo setor', 'Setor de TI'].forEach((role, i) => {
    const x = left + i * (colW + 60);
    doc.moveTo(x, y).lineTo(x + colW, y).lineWidth(0.8).strokeColor('#000').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#000').text(role, x, y + 6, { width: colW, align: 'center' });
    doc.fontSize(8).fillColor('#666').text('Nome, matrícula e data', x, y + 18, { width: colW, align: 'center' });
  });

  // Rodapé com nº do termo e página em todas as páginas
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem; sem isso o pdfkit abriria outra página
    doc.font('Helvetica').fontSize(8).fillColor('#666')
      .text(`${r.number} · página ${i + 1} de ${range.count}`, left, doc.page.height - 30, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
