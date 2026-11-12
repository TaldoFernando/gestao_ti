import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api, apiPage, session } from '../api';
import { Button, ErrorText, input, Pager, Pill } from '../ui';
import { PRIORITY, STATUS, formatDate, type Priority, type Status } from './tickets-shared';

type Row = { id: string; protocol: string; title: string; status: Status; priority: Priority; requesterName: string; sectorName: string | null; assigneeName: string | null; createdAt: string };
type Detail = Row & {
  email: string;
  whatsapp: string;
  description: string;
  equipmentTag: string | null;
  assigneeId: string | null;
  events: { id: string; type: string; message: string; public: boolean; authorName: string | null; createdAt: string }[];
  attachments: { id: string; filename: string; mime: string; size: number }[];
};

export function TicketList() {
  const [status, setStatus] = useState<Status | ''>('ABERTO');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const PAGE_SIZE = 20;

  // Filtro novo volta para a primeira página.
  useEffect(() => setPage(1), [status, mine, q]);

  useEffect(() => {
    const params = new URLSearchParams({ ...(status && { status }), ...(mine && { mine: '1' }), ...(q && { q }), page: String(page), pageSize: String(PAGE_SIZE) });
    const t = setTimeout(
      () =>
        apiPage<Row>(`/tickets?${params}`)
          .then(({ items, total }) => {
            setRows(items);
            setTotal(total);
          })
          .catch((e: Error) => setError(e.message)),
      q ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [status, mine, q, page]);

  return (
    <>
      <div className="border-b border-ink pb-6">
        <h1 className="text-4xl font-medium tracking-tight">Chamados</h1>
        <p className="mt-1 text-muted">Prioridade alta primeiro, depois os mais antigos.</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {(Object.keys(STATUS) as Status[]).map((s) => <Pill key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS[s]}</Pill>)}
        <Pill active={status === ''} onClick={() => setStatus('')}>Todos</Pill>
        <span className="mx-1 w-px self-stretch bg-line" />
        <Pill active={mine} onClick={() => setMine(!mine)}>Comigo</Pill>
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por protocolo, título, solicitante, setor ou patrimônio" aria-label="Buscar" className={`${input} mt-4`} />
      <ErrorText>{error}</ErrorText>

      <ul className="mt-4 border-t border-line">
        {rows?.map((t) => (
          <li key={t.id} className="border-b border-line">
            <Link to={`/chamados/${t.id}`} className="grid gap-x-6 gap-y-1 py-4 transition-colors hover:bg-[#fafafa] md:grid-cols-[150px_1fr_auto]">
              <span className="font-mono text-[13px] text-muted">{t.protocol}</span>
              <span className="min-w-0">
                <span className="font-medium">{t.title}</span>
                <span className="block truncate text-sm text-muted">{t.requesterName}{t.sectorName ? ` · ${t.sectorName}` : ''} · {formatDate(t.createdAt)}</span>
              </span>
              <span className="flex items-center gap-2 text-sm md:justify-end">
                {t.priority === 'ALTA' && <span className="rounded-full bg-gold px-2.5 py-0.5 font-medium">Alta</span>}
                <span className="text-muted">{t.assigneeName ?? 'Sem responsável'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rows && !rows.length && <p className="py-12 text-center text-muted">Nenhum chamado nesta fila.</p>}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} onChange={setPage} />
    </>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const [t, setT] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const load = () => api<Detail>(`/tickets/${id}`).then(setT).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  const patch = (json: object) => api(`/tickets/${id}`, { method: 'PATCH', json }).then(load).catch((e: Error) => setError(e.message));

  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(`/tickets/${id}/events`, { method: 'POST', json: { message: new FormData(form).get('message'), public: isPublic } });
      form.reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Anexo precisa do token; baixa como blob e abre numa aba.
  async function openAttachment(attId: string) {
    const res = await fetch(`/api/tickets/${id}/attachments/${attId}`, { headers: { authorization: `Bearer ${session()?.token}` } });
    if (!res.ok) return setError('Não foi possível abrir o anexo.');
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  }

  if (!t) return <ErrorText>{error}</ErrorText>;
  const mineNow = t.assigneeId === session()?.user.sub;

  return (
    <>
      <Link to="/chamados" className="text-sm text-muted underline-offset-4 hover:underline">← Chamados</Link>
      <div className="mt-3 border-b border-ink pb-6">
        <p className="font-mono text-sm text-muted">{t.protocol}</p>
        <h1 className="mt-1 text-4xl font-medium tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">Aberto em {formatDate(t.createdAt)} · {t.assigneeName ? `com ${t.assigneeName}` : 'sem responsável'}</p>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="whitespace-pre-line text-[17px] leading-relaxed">{t.description}</p>
          {t.attachments.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {t.attachments.map((a) => (
                <li key={a.id}>
                  <button onClick={() => openAttachment(a.id)} className="h-9 rounded-full border border-[#d6d6d6] px-4 text-sm hover:border-ink">
                    {a.filename} <span className="font-mono text-muted">{(a.size / 1024 / 1024).toFixed(1)} MB</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-10 text-xl font-medium">Histórico</h2>
          <ol className="mt-4 border-l border-line">
            {t.events.map((e) => (
              <li key={e.id} className={`relative pb-6 pl-6 before:absolute before:-left-[5px] before:top-1.5 before:size-[9px] before:rounded-full ${e.public ? 'before:bg-ink' : 'before:border before:border-ink before:bg-white'}`}>
                <p className="text-sm text-muted">{formatDate(e.createdAt)}{e.authorName ? ` · ${e.authorName}` : ''}{e.public ? '' : ' · nota interna'}</p>
                <p className="mt-0.5 whitespace-pre-line">{e.message}</p>
              </li>
            ))}
          </ol>

          <form onSubmit={reply} className="grid gap-3">
            <textarea name="message" required maxLength={4000} rows={3} placeholder={isPublic ? 'Resposta para o solicitante…' : 'Nota visível só para a equipe…'} aria-label="Mensagem" className={`${input} h-auto py-2.5`} />
            <div className="flex flex-wrap items-center gap-2">
              <Pill active={isPublic} onClick={() => setIsPublic(true)}>Resposta ao solicitante</Pill>
              <Pill active={!isPublic} onClick={() => setIsPublic(false)}>Nota interna</Pill>
              <Button variant="primary" className="ml-auto">Enviar</Button>
            </div>
          </form>
        </div>

        <aside className="grid content-start gap-6 lg:border-l lg:border-line lg:pl-8">
          {!mineNow && <Button variant="primary" onClick={() => patch({ assignee: 'me' })}>Assumir chamado</Button>}
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <select value={t.status} onChange={(e) => patch({ status: e.target.value })} className={input}>
              {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Prioridade
            <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} className={input}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}
            </select>
          </label>
          <dl className="grid gap-3 text-sm">
            {[
              ['Solicitante', t.requesterName],
              ['E-mail', t.email],
              ['WhatsApp', t.whatsapp],
              ['Setor', t.sectorName ?? '—'],
              ['Patrimônio', t.equipmentTag ?? '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className={k === 'Patrimônio' ? 'font-mono' : ''}>{v}</dd>
              </div>
            ))}
          </dl>
          {mineNow && <Button onClick={() => patch({ assignee: null })}>Devolver para a fila</Button>}
        </aside>
      </div>
    </>
  );
}
