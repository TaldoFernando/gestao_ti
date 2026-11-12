/**
 * Lembra os `messageId` já enviados para não mandar o mesmo e-mail duas vezes.
 *
 * O outbox entrega "pelo menos uma vez" (ADR 0004): se o ticket-service cair entre o
 * confirm do RabbitMQ e a marcação `publishedAt`, ele publica o mesmo evento de novo,
 * com o mesmo `messageId` (o id da linha do outbox).
 *
 * Guarda em memória, com limite de tamanho e validade, porque o worker não tem banco.
 * ponytail: se o próprio worker reiniciar, esquece; trocar por Redis (SET NX com TTL) quando entrar o Redis da issue #7.
 */
export class SeenIds {
  private readonly ids = new Map<string, number>(); // id → expira em (ms)

  constructor(
    private readonly max = 10_000,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  has(id: string) {
    const exp = this.ids.get(id);
    if (exp === undefined) return false;
    if (exp > this.now()) return true;
    this.ids.delete(id);
    return false;
  }

  add(id: string) {
    this.ids.delete(id); // reinsere no fim: o Map mantém a ordem de inserção
    this.ids.set(id, this.now() + this.ttlMs);
    // Passou do limite: descarta os mais antigos.
    for (const oldest of this.ids.keys()) {
      if (this.ids.size <= this.max) break;
      this.ids.delete(oldest);
    }
  }

  delete(id: string) {
    this.ids.delete(id);
  }

  get size() {
    return this.ids.size;
  }
}
