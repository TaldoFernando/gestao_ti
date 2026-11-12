import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type Sector } from '../api';
import { Button, ErrorText, Field, input } from '../ui';
import { STATUS, formatDate } from './tickets-shared';

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-ink px-5 py-4 text-[#9a9a9a] md:px-9">
        <b className="mr-auto text-lg font-semibold text-white">TI Prefeitura</b>
        <Link to="/abrir-chamado" className="flex h-11 items-center hover:text-white">Abrir chamado</Link>
        <Link to="/acompanhar" className="flex h-11 items-center hover:text-white">Acompanhar</Link>
        <Link to="/login" className="flex h-11 items-center hover:text-white">Área do técnico</Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-9">{children}</main>
    </div>
  );
}

export function OpenTicket() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [protocol, setProtocol] = useState('');
  useEffect(() => {
    api<Sector[]>('/sectors').then(setSectors).catch(() => setSectors([]));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { protocol } = await api<{ protocol: string }>('/tickets', { method: 'POST', body: new FormData(e.currentTarget) });
      setProtocol(protocol);
      window.scrollTo(0, 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (protocol)
    return (
      <PublicShell>
        <p className="text-muted">Chamado registrado. Guarde o seu protocolo:</p>
        <p className="mt-3 font-mono text-4xl tracking-tight md:text-5xl">{protocol}</p>
        <p className="mt-6 max-w-prose">A equipe de TI vai analisar o pedido. Você acompanha o andamento com esse protocolo, sem precisar de login.</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link to={`/acompanhar/${protocol}`}><Button variant="primary">Acompanhar chamado</Button></Link>
          <Button onClick={() => setProtocol('')}>Abrir outro chamado</Button>
        </div>
      </PublicShell>
    );

  const roots = sectors.filter((s) => !s.parentId);
  return (
    <PublicShell>
      <h1 className="text-4xl font-medium leading-none tracking-tight md:text-5xl">
        Abrir chamado de TI. <span className="text-[#8a8a8a]">Sem login, direto para a equipe.</span>
      </h1>
      <form onSubmit={submit} className="mt-10 grid gap-5 border-t border-ink pt-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Seu nome"><input name="requesterName" required maxLength={80} autoComplete="name" className={input} /></Field>
          <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className={input} /></Field>
          <Field label="WhatsApp com DDD"><input name="whatsapp" type="tel" required placeholder="(83) 99999-0000" autoComplete="tel" pattern="[\d\s()+\-]{10,20}" className={input} /></Field>
          <Field label="Setor ou local">
            <select name="sectorId" className={input} defaultValue="">
              <option value="">Não sei / outro</option>
              {roots.flatMap((r) => [r, ...sectors.filter((c) => c.parentId === r.id)]).map((s) => (
                <option key={s.id} value={s.id}>{s.parentId ? `↳ ${s.name}` : s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Resumo do problema"><input name="title" required maxLength={120} placeholder="Ex.: Impressora da recepção não liga" className={input} /></Field>
        <Field label="Descrição">
          <textarea name="description" required maxLength={4000} rows={5} placeholder="O que aconteceu, desde quando e o que já foi tentado." className={`${input} h-auto py-2.5`} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nº de patrimônio do equipamento (opcional)"><input name="equipmentTag" maxLength={40} placeholder="Ex.: PAT-00125" className={`${input} font-mono`} /></Field>
          <Field label="Fotos, PDF ou vídeo (até 5, 20 MB cada)">
            <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime" className="text-sm file:mr-3 file:h-11 file:rounded-full file:border file:border-[#cfcfcf] file:bg-white file:px-4 file:font-sans file:text-sm" />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div><Button variant="primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar chamado'}</Button></div>
      </form>
    </PublicShell>
  );
}

type PublicTicket = { protocol: string; title: string; status: keyof typeof STATUS; sectorName: string | null; createdAt: string; events: { type: string; message: string; createdAt: string }[] };

export function TrackTicket() {
  const { protocol } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setTicket(null);
    setError('');
    if (protocol) api<PublicTicket>(`/tickets/protocol/${encodeURIComponent(protocol.trim())}`).then(setTicket).catch((e: Error) => setError(e.message));
  }, [protocol]);

  return (
    <PublicShell>
      <h1 className="text-4xl font-medium tracking-tight">Acompanhar chamado</h1>
      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/acompanhar/${String(new FormData(e.currentTarget).get('p')).trim().toUpperCase()}`);
        }}
      >
        <input name="p" required defaultValue={protocol} placeholder="JAC-XXXX-XXXX" aria-label="Protocolo" className={`${input} flex-1 basis-60 font-mono uppercase`} />
        <Button variant="primary">Consultar</Button>
      </form>
      <div className="mt-4"><ErrorText>{error}</ErrorText></div>

      {ticket && (
        <section className="mt-8 border-t border-ink pt-6">
          <p className="font-mono text-sm text-muted">{ticket.protocol}</p>
          <h2 className="mt-1 text-2xl font-medium tracking-tight">{ticket.title}</h2>
          <p className="mt-1 text-muted">{ticket.sectorName ?? 'Setor não informado'} · aberto em {formatDate(ticket.createdAt)}</p>
          <p className="mt-4 inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm text-white">{STATUS[ticket.status]}</p>
          <ol className="mt-8 grid gap-0 border-l border-line">
            {ticket.events.map((e, i) => (
              <li key={i} className="relative pb-6 pl-6 before:absolute before:-left-[5px] before:top-1.5 before:size-[9px] before:rounded-full before:bg-ink">
                <p className="text-sm text-muted">{formatDate(e.createdAt)}</p>
                <p className="mt-0.5 whitespace-pre-line">{e.message}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </PublicShell>
  );
}
