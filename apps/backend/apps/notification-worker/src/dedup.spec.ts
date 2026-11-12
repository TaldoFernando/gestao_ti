import { SeenIds } from './dedup';

describe('SeenIds (e-mail duplicado)', () => {
  it('reconhece um messageId já processado', () => {
    const seen = new SeenIds();
    expect(seen.has('evt-1')).toBe(false);
    seen.add('evt-1');
    expect(seen.has('evt-1')).toBe(true);
    expect(seen.has('evt-2')).toBe(false);
  });

  it('esquece depois da validade', () => {
    let t = 0;
    const seen = new SeenIds(100, 1000, () => t);
    seen.add('evt-1');
    t = 999;
    expect(seen.has('evt-1')).toBe(true);
    t = 1000;
    expect(seen.has('evt-1')).toBe(false);
  });

  it('não passa do limite e descarta os mais antigos', () => {
    const seen = new SeenIds(2);
    seen.add('a');
    seen.add('b');
    seen.add('c');
    expect(seen.size).toBe(2);
    expect(seen.has('a')).toBe(false);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });

  it('delete libera o id para nova tentativa', () => {
    const seen = new SeenIds();
    seen.add('evt-1');
    seen.delete('evt-1');
    expect(seen.has('evt-1')).toBe(false);
  });
});
