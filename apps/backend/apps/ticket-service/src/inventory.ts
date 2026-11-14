import { BadRequestException } from '@nestjs/common';

export type LinkedEquipment = { id: string; assetTag: string };

/**
 * Confere o nº de patrimônio informado no chamado direto no asset-service (rede interna, sem passar pelo gateway).
 * - existe → devolve o id e o patrimônio como está cadastrado
 * - não existe → 400, sem revelar nada do inventário (nem nome, nem local)
 * - inventário fora do ar → null: o chamado abre mesmo assim, só com o texto digitado (ADR 0001)
 */
export async function findEquipment(tag: string | undefined, assetUrl: string, fetchFn: typeof fetch = fetch): Promise<LinkedEquipment | null> {
  if (!tag) return null;
  try {
    const res = await fetchFn(`${assetUrl}/api/equipment/by-tag/${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(2000) });
    if (res.status === 404) throw new BadRequestException('Patrimônio não encontrado. Confira o número na etiqueta do equipamento ou deixe o campo em branco.');
    if (!res.ok) return null;
    const e = (await res.json()) as LinkedEquipment;
    return { id: e.id, assetTag: e.assetTag };
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    return null;
  }
}
