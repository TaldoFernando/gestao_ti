import { isProtocolCollision, newProtocol, withUniqueProtocol } from './protocol';

it('protocolo tem formato JAC-XXXX-XXXX sem caracteres ambíguos e não se repete', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const p = newProtocol();
    expect(p).toMatch(/^JAC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    seen.add(p);
  }
  expect(seen.size).toBe(1000);
});

describe('colisão de protocolo', () => {
  const collision = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['protocol'] } });

  it('reconhece só o P2002 da coluna protocol', () => {
    expect(isProtocolCollision(collision)).toBe(true);
    expect(isProtocolCollision({ code: 'P2002', meta: { target: 'Ticket_protocol_key' } })).toBe(true);
    expect(isProtocolCollision({ code: 'P2002', meta: { target: ['email'] } })).toBe(false);
    expect(isProtocolCollision({ code: 'P2025' })).toBe(false);
    expect(isProtocolCollision(new Error('outro'))).toBe(false);
  });

  it('protocolo repetido gera outro e o chamado é criado', async () => {
    const gen = jest.fn().mockReturnValueOnce('JAC-AAAA-AAAA').mockReturnValueOnce('JAC-BBBB-BBBB');
    const create = jest.fn(async (p: string) => {
      if (p === 'JAC-AAAA-AAAA') throw collision;
      return { protocol: p };
    });
    await expect(withUniqueProtocol(create, 5, gen)).resolves.toEqual({ protocol: 'JAC-BBBB-BBBB' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('desiste depois do limite de tentativas', async () => {
    const create = jest.fn(async () => {
      throw collision;
    });
    await expect(withUniqueProtocol(create, 3)).rejects.toBe(collision);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('outros erros não são repetidos', async () => {
    const boom = new Error('banco fora');
    const create = jest.fn(async () => {
      throw boom;
    });
    await expect(withUniqueProtocol(create)).rejects.toBe(boom);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
