import { Link, useParams } from 'react-router';
import { equipmentIn, sectorPath } from '../api';
import { Button, ErrorText, useInventory } from '../ui';

const today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());

/** Termo de responsabilidade / relatório por setor. Impressão pelo navegador (Ctrl+P ou o botão). */
export default function Report() {
  const { id } = useParams();
  const { sectors, equipment, error, loading } = useInventory();
  const sector = sectors.find((s) => s.id === id);
  if (loading) return null;
  if (!sector) return <ErrorText>{error || 'Setor não encontrado ou fora do seu acesso.'}</ErrorText>;

  const items = equipmentIn(sector.id, sectors, equipment).sort((a, b) =>
    sectorPath(sectors, a.sectorId).localeCompare(sectorPath(sectors, b.sectorId), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'),
  );
  const parent = sectors.find((s) => s.id === sector.parentId);

  return (
    <article className="mx-auto max-w-4xl print:max-w-none">
      <div className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/setores" className="mr-auto text-sm text-muted underline-offset-4 hover:underline">← Setores</Link>
        <Button variant="primary" onClick={() => window.print()}>Imprimir relatório</Button>
      </div>

      <header className="border-b border-ink pb-5">
        <p className="text-sm text-muted">Prefeitura Municipal de Jacaraú · Setor de Tecnologia da Informação</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Relação de equipamentos de TI</h1>
        <p className="mt-1 text-xl">{parent ? `${parent.name} › ` : ''}{sector.name}</p>
        <p className="mt-3 text-sm text-muted">Emitido em {today} · <span className="font-mono">{items.length}</span> {items.length === 1 ? 'item' : 'itens'}</p>
      </header>

      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink text-xs text-muted">
            {['Patrimônio', 'Equipamento', 'Tipo', 'Série', 'Vínculo', 'Local'].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="break-inside-avoid border-b border-line">
              <td className="whitespace-nowrap py-2 pr-4 font-mono">{e.assetTag ?? '—'}</td>
              <td className="py-2 pr-4">{e.name}</td>
              <td className="py-2 pr-4">{e.type}</td>
              <td className="whitespace-nowrap py-2 pr-4 font-mono">{e.serial ?? '—'}</td>
              <td className="py-2 pr-4">{e.ownership === 'ALUGADO' ? 'Alugado' : 'Próprio'}</td>
              <td className="py-2 pr-4">{sectors.find((s) => s.id === e.sectorId)?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="py-10 text-center text-muted">Nenhum equipamento registrado neste setor.</p>}

      <footer className="mt-20 grid grid-cols-2 gap-16 text-center text-sm break-inside-avoid">
        {['Responsável pelo setor', 'Setor de TI'].map((role) => (
          <div key={role} className="border-t border-ink pt-2">{role}</div>
        ))}
      </footer>
    </article>
  );
}
