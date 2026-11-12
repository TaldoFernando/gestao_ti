import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api, session, sectorPath, type Equipment, type Sector } from '../api';
import { Button, Confirm, Dialog, ErrorText, Field, input, Pill, useInventory } from '../ui';

export default function EquipmentPage() {
  const { sectors, equipment, error, loading, reload } = useInventory();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Equipment | null>(null);
  const canEdit = session()?.user.role === 'TECNICO';

  const sectorId = params.get('setor') ?? '';
  const inSector = (e: Equipment) =>
    !sectorId || (sectorId === 'none' ? !e.sectorId : e.sectorId === sectorId || sectors.some((s) => s.id === e.sectorId && s.parentId === sectorId));
  const q = search.trim().toLocaleLowerCase('pt-BR');
  const rows = equipment.filter(
    (e) =>
      inSector(e) &&
      (!type || e.type === type) &&
      [e.name, e.type, e.assetTag, e.serial, sectorPath(sectors, e.sectorId)].join(' ').toLocaleLowerCase('pt-BR').includes(q),
  );
  const types = [...new Set(equipment.map((e) => e.type))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-6">
        <div>
          <h1 className="text-4xl font-medium tracking-tight">Equipamentos</h1>
          <p className="mt-1 text-muted">{loading ? 'Carregando…' : `${rows.length} de ${equipment.length} itens`}</p>
        </div>
        {canEdit && <Button variant="primary" onClick={() => setEditing('new')}>Cadastrar equipamento</Button>}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        <Pill active={!type} onClick={() => setType('')}>Todos</Pill>
        {types.map((t) => (
          <Pill key={t} active={type === t} onClick={() => setType(t)}>{t}</Pill>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, patrimônio, série ou local" aria-label="Buscar" className={`${input} min-w-0 flex-1 basis-72`} />
        <select value={sectorId} onChange={(e) => setParams(e.target.value ? { setor: e.target.value } : {})} aria-label="Filtrar por local" className={`${input} flex-1 basis-56 md:max-w-xs`}>
          <option value="">Todos os locais</option>
          <option value="none">Sem local definido</option>
          <SectorOptions sectors={sectors} />
        </select>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {['Equipamento', 'Patrimônio', 'Série', 'Local', ''].map((h) => <th key={h} className="py-2.5 pr-5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-[#eee] transition-colors hover:bg-[#fafafa]">
                <td className="py-3.5 pr-5">
                  {e.name}
                  <span className="ml-2 text-sm text-muted">{e.type}{e.ownership === 'ALUGADO' ? ' · alugado' : ''}</span>
                </td>
                <td className="whitespace-nowrap py-3.5 pr-5 font-mono text-[13px]">{e.assetTag ?? '—'}</td>
                <td className="whitespace-nowrap py-3.5 pr-5 font-mono text-[13px]">{e.serial ?? '—'}</td>
                <td className="py-3.5 pr-5 text-muted">{sectorPath(sectors, e.sectorId) || 'Sem local'}</td>
                <td className="whitespace-nowrap py-1.5 text-right">
                  {canEdit && (
                    <>
                      <Button variant="ghost" className="h-9 px-3" onClick={() => setEditing(e)}>Editar</Button>
                      <Button variant="ghost" className="h-9 px-3 text-[#c2381f]" onClick={() => setDeleting(e)}>Excluir</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length && (
          <p className="py-12 text-center text-muted">Nenhum equipamento encontrado. Ajuste os filtros ou cadastre um novo.</p>
        )}
      </div>

      <EquipmentForm sectors={sectors} types={types} value={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <Confirm
        text={deleting && `O equipamento “${deleting.name}” será removido do cadastro.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api(`/equipment/${deleting!.id}`, { method: 'DELETE' });
          await reload();
        }}
      />
    </>
  );
}

export function SectorOptions({ sectors }: { sectors: Sector[] }) {
  return sectors
    .filter((s) => !s.parentId)
    .flatMap((root) => [root, ...sectors.filter((c) => c.parentId === root.id)])
    .map((s) => (
      <option key={s.id} value={s.id}>{s.parentId ? `↳ ${s.name}` : s.name}</option>
    ));
}

function EquipmentForm({ sectors, types, value, onClose, onSaved }: { sectors: Sector[]; types: string[]; value: Equipment | 'new' | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const editing = value && value !== 'new' ? value : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = { ...f, assetTag: f.assetTag || null, serial: f.serial || null, sectorId: f.sectorId || null };
    try {
      await api(editing ? `/equipment/${editing.id}` : '/equipment', { method: editing ? 'PATCH' : 'POST', json: body });
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={value !== null} onClose={() => { setError(''); onClose(); }} title={editing ? 'Editar equipamento' : 'Cadastrar equipamento'}>
      {/* key remonta o form a cada abertura, limpando os campos */}
      <form key={editing?.id ?? String(value)} onSubmit={submit} className="grid gap-4">
        <Field label="Nome do equipamento">
          <input name="name" required maxLength={80} defaultValue={editing?.name} placeholder="Ex.: Computador Dell OptiPlex" className={input} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <input name="type" required maxLength={50} list="equipment-types" defaultValue={editing?.type} placeholder="Ex.: Computador" className={input} />
            <datalist id="equipment-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Vínculo">
            <select name="ownership" defaultValue={editing?.ownership ?? 'PROPRIO'} className={input}>
              <option value="PROPRIO">Próprio</option>
              <option value="ALUGADO">Alugado</option>
            </select>
          </Field>
          <Field label="Nº de patrimônio">
            <input name="assetTag" maxLength={40} defaultValue={editing?.assetTag ?? ''} placeholder="Ex.: PAT-00125" className={`${input} font-mono`} />
          </Field>
          <Field label="Nº de série">
            <input name="serial" maxLength={60} defaultValue={editing?.serial ?? ''} placeholder="Opcional" className={`${input} font-mono`} />
          </Field>
        </div>
        <Field label="Local">
          <select name="sectorId" defaultValue={editing?.sectorId ?? ''} className={input}>
            <option value="">Sem local definido</option>
            <SectorOptions sectors={sectors} />
          </select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="primary">Salvar equipamento</Button>
        </div>
      </form>
    </Dialog>
  );
}
