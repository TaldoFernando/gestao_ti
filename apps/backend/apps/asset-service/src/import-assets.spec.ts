import { readAssets, validateRow } from './import-assets';
const header = 'assetTag;name;type;serial;ownership;sector;sectorType;local;localType';
it('lê CSV Excel UTF-8 BOM, campos entre aspas e delimitador ponto-e-vírgula', () => {
  const rows = readAssets(`\uFEFF${header}\r\nP1;"PC; recepção";Computador;;PROPRIO;TI;Secretaria;;\r\n`);
  expect(rows[0].name).toBe('PC; recepção'); expect(() => validateRow(rows[0])).not.toThrow();
});
it('aceita vírgula e rejeita cabeçalho e campos incompatíveis', () => {
  expect(readAssets('assetTag,name,type,sector\nP1,PC,Computador,TI')[0].assetTag).toBe('P1');
  expect(() => readAssets('patrimonio,nome\nP1,PC')).toThrow('Cabeçalho');
  const row = readAssets(`${header}\n;PC;Computador;;PROPRIO;TI;Secretaria;;`)[0];
  expect(() => validateRow(row)).toThrow('assetTag');
  expect(() => validateRow({ ...row, assetTag: 'P1', ownership: 'INVALID' as never })).toThrow('ownership');
});
