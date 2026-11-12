import { BadRequestException } from '@nestjs/common';
import { findEquipment } from './inventory';

const reply = (status: number, body: unknown = {}) => jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('vínculo do chamado com o equipamento', () => {
  it('sem patrimônio informado não consulta o inventário', async () => {
    const f = reply(200);
    await expect(findEquipment(undefined, 'http://asset', f)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('patrimônio existente devolve só id e patrimônio', async () => {
    const f = reply(200, { id: 'eq-1', assetTag: 'PAT-00201', name: 'Impressora', sectorId: 's-1' });
    await expect(findEquipment('pat-00201', 'http://asset', f)).resolves.toEqual({ id: 'eq-1', assetTag: 'PAT-00201' });
    expect(f).toHaveBeenCalledWith('http://asset/api/equipment/by-tag/pat-00201', expect.anything());
  });

  it('patrimônio inexistente recusa o chamado com 400', async () => {
    await expect(findEquipment('PAT-99999', 'http://asset', reply(404))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inventário fora do ar não impede a abertura (ADR 0001)', async () => {
    const down = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(findEquipment('PAT-00201', 'http://asset', down)).resolves.toBeNull();
    await expect(findEquipment('PAT-00201', 'http://asset', reply(503))).resolves.toBeNull();
  });
});
