import { newProtocol } from './protocol';

it('protocolo tem formato JAC-XXXX-XXXX sem caracteres ambíguos e não se repete', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const p = newProtocol();
    expect(p).toMatch(/^JAC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    seen.add(p);
  }
  expect(seen.size).toBe(1000);
});
