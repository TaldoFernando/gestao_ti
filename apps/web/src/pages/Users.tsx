import { useEffect, useState, type FormEvent } from 'react';
import { api, sectorPath, type AppUser } from '../api';
import { Button, Dialog, ErrorText, Field, input, Pager, Pill, usePage, useInventory } from '../ui';
import { SectorOptions } from './Equipment';

export default function Users() {
  const { sectors } = useInventory();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | 'TECNICO' | 'RESPONSAVEL'>('');
  const q = search.trim().toLocaleLowerCase('pt-BR');
  const rows = users.filter(
    (u) => (!role || u.role === role) && [u.name, u.email, sectorPath(sectors, u.sectorId)].join(' ').toLocaleLowerCase('pt-BR').includes(q),
  );
  const paged = usePage(rows, 20, `${q}|${role}`);
  const load = () => api<AppUser[]>('/users').then(setUsers).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api('/users', { method: 'POST', json: { ...f, sectorId: f.sectorId || undefined } });
      setOpen(false);
      load();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-6">
        <div>
          <h1 className="text-4xl font-medium tracking-tight">Usuários</h1>
          <p className="mt-1 text-muted">Técnicos gerenciam tudo; responsáveis consultam só o próprio setor.</p>
        </div>
        <Button variant="primary" onClick={() => { setFormError(''); setOpen(true); }}>Cadastrar usuário</Button>
      </div>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por perfil">
        <Pill active={!role} onClick={() => setRole('')}>Todos</Pill>
        <Pill active={role === 'TECNICO'} onClick={() => setRole('TECNICO')}>Técnicos</Pill>
        <Pill active={role === 'RESPONSAVEL'} onClick={() => setRole('RESPONSAVEL')}>Responsáveis</Pill>
      </div>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou setor" aria-label="Buscar usuários" className={`${input} mt-4`} />
      <ErrorText>{error}</ErrorText>
      {users.length > 0 && !rows.length && <p className="py-12 text-center text-muted">Nenhum usuário encontrado.</p>}
      <ul className="mt-2">
        {paged.pageItems.map((u) => (
          <li key={u.id} className="grid gap-x-6 border-b border-line py-4 md:grid-cols-[1fr_1fr_auto]">
            <span><span className="font-medium">{u.name}</span><span className="block text-sm text-muted">{u.email}</span></span>
            <span className="text-muted">{u.role === 'TECNICO' ? 'Técnico de TI' : `Responsável · ${sectorPath(sectors, u.sectorId) || 'sem setor'}`}</span>
          </li>
        ))}
      </ul>
      <Pager page={paged.page} pages={paged.pages} total={rows.length} onChange={paged.setPage} />

      <Dialog open={open} onClose={() => setOpen(false)} title="Cadastrar usuário">
        <form key={String(open)} onSubmit={submit} className="grid gap-4">
          <Field label="Nome"><input name="name" required maxLength={80} className={input} /></Field>
          <Field label="E-mail"><input name="email" type="email" required className={input} /></Field>
          <Field label="Senha inicial (mín. 8 caracteres)"><input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Perfil">
              <select name="role" className={input} defaultValue="RESPONSAVEL">
                <option value="RESPONSAVEL">Responsável do setor</option>
                <option value="TECNICO">Técnico de TI</option>
              </select>
            </Field>
            <Field label="Setor (responsável)">
              <select name="sectorId" className={input} defaultValue="">
                <option value="">Nenhum</option>
                <SectorOptions sectors={sectors} />
              </select>
            </Field>
          </div>
          <ErrorText>{formError}</ErrorText>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary">Salvar usuário</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
