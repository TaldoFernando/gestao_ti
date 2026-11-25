import { buildReportPdf, reportNumber, slug, type ReportItem } from './report';

// PDF sem compressão: o pdfkit grava o texto em pedaços hexadecimais (<...>); juntando-os, dá para procurar o texto.
const text = (pdf: Buffer) => pdf.toString('latin1');
const words = (pdf: Buffer) => [...text(pdf).matchAll(/<([0-9a-f]+)>/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('')
  .replace(/\x9b/g, '›').replace(/\x97/g, '—'); // WinAnsi das fontes padrão do PDF
const item = (i: number): ReportItem => ({ assetTag: `PAT-${String(i).padStart(5, '0')}`, name: `Computador ${i}`, type: 'Computador', serial: null, ownership: 'PROPRIO', local: 'Escola' });

describe('termo de responsabilidade em PDF', () => {
  const issuedAt = new Date('2026-11-13T13:42:00Z'); // 10:42 em Fortaleza

  it('nº do termo tem data/hora de Fortaleza e o início do id do setor', () => {
    expect(reportNumber('ab12cd34-0000-4000-8000-000000000000', issuedAt)).toBe('TR-20261113-1042-AB12');
  });

  it('nome do arquivo sem acento nem espaço', () => {
    expect(slug('Secretaria de Educação › Escola São José')).toBe('secretaria-de-educacao-escola-sao-jose');
    expect(slug('***')).toBe('setor');
  });

  it('gera um PDF com nº, data, itens e assinaturas', async () => {
    const pdf = await buildReportPdf({ sectorName: 'Escola', parentName: 'Educação', items: [item(1)], issuedAt, number: 'TR-20261113-1042-AB12' }, false);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const t = words(pdf);
    for (const s of ['Nº TR-20261113-1042-AB12', 'Emitido em 13 de novembro de 2026', 'Educação › Escola', 'PAT-00001', 'Computador 1', 'Termo de responsabilidade', 'Responsável pelo setor', 'Setor de TI', 'página 1 de 1']) expect(t).toContain(s);
  });

  it('muitos itens quebram em várias páginas', async () => {
    const pdf = await buildReportPdf({ sectorName: 'Escola', parentName: null, items: Array.from({ length: 80 }, (_, i) => item(i)), issuedAt, number: 'TR-X' }, false);
    const pages = (text(pdf).match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });

  it('setor sem equipamentos ainda gera o termo', async () => {
    const pdf = await buildReportPdf({ sectorName: 'Vazio', parentName: null, items: [], issuedAt, number: 'TR-Y' }, false);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
