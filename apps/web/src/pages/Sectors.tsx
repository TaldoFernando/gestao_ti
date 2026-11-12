import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, equipmentIn, session, type Sector } from '../api';
import { Button, Confirm, Dialog, ErrorText, Field, input, Pager, usePage, useInventory } from '../ui';

type Editing = { sector?: Sector; parentId: string | null } | null;

export default function SectorsPage() {
  const { sectors, equipment, error, reload } = useInventory();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Sector | null>(null);
  const canEdit = session()?.user.role === 'TECNICO';
  const [search, setSearch] = useState('');
  const roots = sectors.filter((s) => !s.parentId);
  const countOf = (id: string) => equipment.filter((e) => e.sectorId === id).length;

  // Busca em nome, tipo e descrição. Setor principal que bate mostra todos os locais;
  // senão aparece só com os locais que bateram.
  const q = search.trim().toLocaleLowerCase('pt-BR');
  const matches = (s: Sector) => !q || [s.name, s.type, s.description].join(' ').toLocaleLowerCase('pt-BR').includes(q);
  const groups = roots
    .map((root) => {
      const all = sectors.filter((s) => s.parentId === root.id);
      return { root, children: matches(root) ? all : all.filter(matches) };
    })
    .filter((g) => matches(g.root) || g.children.length);
  const paged = usePage(groups, q);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-6">
        <div>
          <h1 className="text-4xl font-medium tracking-tight">Setores e locais</h1>
          <p className="mt-1 text-muted">Secretarias e as escolas, unidades e departamentos vinculados a elas.</p>
        </div>
        {canEdit && <Button variant="primary" onClick={() => setEditing({ parentId: null })}>Cadastrar setor principal</Button>}
      </div>

      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar setor ou local por nome, tipo ou descrição" aria-label="Buscar setores" className={`${input} mt-6`} />
      <ErrorText>{error}</ErrorText>
      {q && !groups.length && <p className="py-12 text-center text-muted">Nenhum setor ou local encontrado para “{search.trim()}”.</p>}

      {paged.pageItems.map(({ root, children }) => {
        const total = equipmentIn(root.id, sectors, equipment).length;
        const linked = sectors.filter((s) => s.parentId === root.id).length;
        return (
          <section key={root.id} className="border-b border-line py-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs lowercase text-muted">{root.type} · setor principal</p>
                <h2 className="mt-1 text-2xl font-medium tracking-tight">
                  <Link to={`/equipamentos?setor=${root.id}`} className="underline-offset-4 hover:underline">{root.name}</Link>
                </h2>
                <p className="text-sm text-muted">
                  {linked} {linked === 1 ? 'local vinculado' : 'locais vinculados'} · <span className="font-mono">{total}</span> {total === 1 ? 'equipamento' : 'equipamentos'}
                </p>
                {root.description && <p className="mt-1 text-sm">{root.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Link to={`/setores/${root.id}/relatorio`} className="flex h-9 items-center px-3 text-sm font-medium underline-offset-4 hover:underline">Relatório</Link>
                {canEdit && (
                  <>
                    <Button variant="ghost" className="h-9 px-3" onClick={() => setEditing({ parentId: root.id })}>Adicionar local</Button>
                    <Button variant="ghost" className="h-9 px-3" onClick={() => setEditing({ sector: root, parentId: null })}>Editar</Button>
                    <Button variant="ghost" className="h-9 px-3 text-[#c2381f]" onClick={() => setDeleting(root)}>Excluir</Button>
                  </>
                )}
              </div>
            </div>

            {children.length > 0 && (
              <ul className="mt-5 grid gap-2 md:grid-cols-2">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-[#f4f4f4] px-4 py-3">
                    <Link to={`/equipamentos?setor=${c.id}`} className="group min-w-0">
                      <p className="font-mono text-xs lowercase text-muted">{c.type}</p>
                      <p className="truncate font-medium group-hover:underline">{c.name}</p>
                      <p className="text-sm text-muted"><span className="font-mono">{countOf(c.id)}</span> {countOf(c.id) === 1 ? 'equipamento' : 'equipamentos'}</p>
                    </Link>
                    <div className="flex shrink-0 items-center">
                      <Link to={`/setores/${c.id}/relatorio`} className="flex h-9 items-center px-3 text-sm font-medium underline-offset-4 hover:underline">Relatório</Link>
                      {canEdit && (
                        <>
                          <Button variant="ghost" className="h-9 px-3" onClick={() => setEditing({ sector: c, parentId: c.parentId })}>Editar</Button>
                          <Button variant="ghost" className="h-9 px-3 text-[#c2381f]" onClick={() => setDeleting(c)}>Excluir</Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Pager page={paged.page} pages={paged.pages} total={groups.length} onChange={paged.setPage} />

      <SectorForm roots={roots} value={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <Confirm
        text={deleting && `O setor “${deleting.name}” será excluído. Os equipamentos alocados nele ficarão sem local.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api(`/sectors/${deleting!.id}`, { method: 'DELETE' });
          await reload();
        }}
      />
    </>
  );
}

function SectorForm({ roots, value, onClose, onSaved }: { roots: Sector[]; value: Editing; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const sector = value?.sector;
  const title = sector ? 'Editar cadastro' : value?.parentId ? 'Adicionar local' : 'Cadastrar setor principal';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = { ...f, parentId: f.parentId || null };
    try {
      await api(sector ? `/sectors/${sector.id}` : '/sectors', { method: sector ? 'PATCH' : 'POST', json: body });
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={value !== null} onClose={() => { setError(''); onClose(); }} title={title}>
      <form key={`${sector?.id}-${value?.parentId}`} onSubmit={submit} className="grid gap-4">
        <Field label="Nome">
          <input name="name" required maxLength={80} defaultValue={sector?.name} placeholder="Ex.: Secretaria de Educação ou Escola Municipal" className={input} />
        </Field>
        <Field label="Tipo">
          <input name="type" required maxLength={50} list="sector-types" defaultValue={sector?.type} placeholder="Ex.: Secretaria, escola, UBS" className={input} />
          <datalist id="sector-types">
            {['Secretaria', 'Departamento', 'Escola', 'Hospital', 'Unidade de saúde', 'UBS', 'Outro'].map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="Vinculado a">
          <select name="parentId" defaultValue={value?.parentId ?? ''} className={input}>
            <option value="">Nenhum (setor principal)</option>
            {roots.filter((r) => r.id !== sector?.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Descrição (opcional)">
          <textarea name="description" maxLength={200} rows={3} defaultValue={sector?.description} placeholder="Endereço ou observações" className={`${input} h-auto py-2.5`} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="primary">Salvar</Button>
        </div>
      </form>
    </Dialog>
  );
}
