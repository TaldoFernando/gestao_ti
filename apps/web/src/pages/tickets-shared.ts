export const STATUS = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  AGUARDANDO: 'Aguardando retorno',
  RESOLVIDO: 'Resolvido',
} as const;

export const PRIORITY = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' } as const;

export type Status = keyof typeof STATUS;
export type Priority = keyof typeof PRIORITY;

const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (iso: string) => fmt.format(new Date(iso));
