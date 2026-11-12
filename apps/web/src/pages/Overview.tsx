import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { apiPage, equipmentIn, session } from '../api';
import { Bars, Donut, Split, topSlices } from '../charts';
import { ErrorText, useInventory } from '../ui';
import { STATUS, type Status } from './tickets-shared';

function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-ink pt-5 ${className}`}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const more = (to: string, label: string) => <Link to={to} className="whitespace-nowrap text-sm underline-offset-4 hover:underline">{label} →</Link>;

/** Total por status: uma consulta de 1 item por status, lendo só o X-Total-Count. */
function useTicketCounts(enabled: boolean) {
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const keys = Object.keys(STATUS) as Status[];
    Promise.all(keys.map((s) => apiPage(`/tickets?status=${s}&pageSize=1`).then((r) => r.total)))
      .then((totals) => setCounts(Object.fromEntries(keys.map((k, i) => [k, totals[i]])) as Record<Status, number>))
      .catch(() => setCounts(null));
  }, [enabled]);
  return counts;
}

export default function Overview() {
  const { sectors, equipment, error, loading } = useInventory();
  const isTech = session()?.user.role === 'TECNICO';
  const tickets = useTicketCounts(isTech);

  const roots = sectors.filter((s) => !s.parentId);
  const unassigned = equipment.filter((e) => !e.sectorId).length;
  const byType = topSlices(equipment.map((e) => e.type));
  const bySector = [
    ...roots.map((s) => ({ key: s.id, label: s.name, value: equipmentIn(s.id, sectors, equipment).length })).sort((a, b) => b.value - a.value),
    ...(unassigned ? [{ key: 'none', label: 'Sem local definido', value: unassigned }] : []),
  ];
  const owned = equipment.filter((e) => e.ownership !== 'ALUGADO').length;
  const pending = tickets ? tickets.ABERTO + tickets.EM_ATENDIMENTO + tickets.AGUARDANDO : null;

  return (
    <>
      <header className="grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
        <h1 className="text-4xl font-medium leading-none tracking-tight md:text-5xl">
          Patrimônio de TI. <span className="text-[#8a8a8a]">Tudo que está em cada setor.</span>
        </h1>
        <dl className="flex flex-wrap gap-8 lg:justify-end">
          {[
            [equipment.length, 'equipamentos'],
            [sectors.length, 'locais'],
            ...(isTech ? [[pending ?? '–', 'chamados em aberto']] : []),
          ].map(([n, label]) => (
            <div key={label} className="text-right">
              <dd className="font-mono text-5xl leading-none tracking-tighter">{loading ? '–' : n}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <ErrorText>{error}</ErrorText>

      {!loading && (
        <div className="mt-10 grid gap-x-12 gap-y-12 lg:grid-cols-2">
          <Panel title="Equipamentos por categoria" action={more('/equipamentos', 'Ver equipamentos')}>
            {byType.length ? (
              <Donut slices={byType} unit={['equipamento', 'equipamentos']} linkTo={(t) => `/equipamentos?tipo=${encodeURIComponent(t)}`} />
            ) : (
              <p className="text-muted">Nenhum equipamento cadastrado.</p>
            )}
          </Panel>

          {isTech ? (
            <Panel title="Chamados por status" action={more('/chamados', 'Abrir fila')}>
              {tickets ? (
                <Bars rows={(Object.keys(STATUS) as Status[]).map((s) => ({ key: s, label: STATUS[s], value: tickets[s] }))} linkTo={() => '/chamados'} />
              ) : (
                <p className="text-muted">Carregando…</p>
              )}
            </Panel>
          ) : (
            <Panel title="Vínculo dos equipamentos">
              <Split parts={[{ label: 'Próprios', value: owned }, { label: 'Alugados', value: equipment.length - owned }]} />
            </Panel>
          )}

          <Panel title="Equipamentos por setor" action={more('/setores', 'Gerenciar setores')}>
            <Bars rows={bySector} linkTo={(k) => `/equipamentos?setor=${k}`} />
          </Panel>

          {isTech && (
            <Panel title="Vínculo dos equipamentos">
              <Split parts={[{ label: 'Próprios', value: owned }, { label: 'Alugados', value: equipment.length - owned }]} />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
