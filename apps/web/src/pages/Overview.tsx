import { Link } from 'react-router';
import { equipmentIn } from '../api';
import { ErrorText, useInventory } from '../ui';

export default function Overview() {
  const { sectors, equipment, error, loading } = useInventory();
  const roots = sectors.filter((s) => !s.parentId);
  const unassigned = equipment.filter((e) => !e.sectorId).length;
  const rows = roots.map((s) => ({ ...s, count: equipmentIn(s.id, sectors, equipment).length, children: sectors.filter((c) => c.parentId === s.id).length }));
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <>
      <header className="grid items-end gap-8 border-b border-ink pb-6 lg:grid-cols-[1.4fr_1fr]">
        <h1 className="text-4xl font-medium leading-none tracking-tight md:text-5xl">
          Patrimônio de TI. <span className="text-[#8a8a8a]">Tudo que está em cada setor.</span>
        </h1>
        <dl className="flex gap-8 lg:justify-end">
          {[
            [equipment.length, 'equipamentos'],
            [sectors.length, 'locais'],
            [unassigned, 'sem local'],
          ].map(([n, label]) => (
            <div key={label} className="text-right">
              <dd className="font-mono text-5xl leading-none tracking-tighter">{loading ? '–' : n}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <ErrorText>{error}</ErrorText>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-xl font-medium">Equipamentos por setor</h2>
          <Link to="/setores" className="text-sm underline-offset-4 hover:underline">Gerenciar setores →</Link>
        </div>
        <ul className="grid border-t border-line md:grid-cols-2 md:gap-x-10">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line py-4">
              <Link to={`/equipamentos?setor=${r.id}`} className="group block">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium group-hover:underline">{r.name}</span>
                  <span className="font-mono text-xl">{r.count}</span>
                </div>
                <p className="text-sm text-muted">{r.type}{r.children ? ` · ${r.children} ${r.children === 1 ? 'local vinculado' : 'locais vinculados'}` : ''}</p>
                <div className="mt-3 h-[3px] bg-[#f0f0f0]"><div className="h-full bg-ink" style={{ width: `${(r.count / max) * 100}%` }} /></div>
              </Link>
            </li>
          ))}
          {unassigned > 0 && (
            <li className="border-b border-line py-4">
              <Link to="/equipamentos?setor=none" className="flex items-baseline justify-between gap-4 hover:underline">
                <span className="font-medium">Sem local definido</span>
                <span className="font-mono text-xl text-[#a85b00]">{unassigned}</span>
              </Link>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
