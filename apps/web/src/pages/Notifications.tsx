import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, ErrorText } from '../ui';

type Letter = { id: string; protocol: string; type: string; error: string; attempts: number };
export default function Notifications() {
  const [items, setItems] = useState<Letter[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const data = await api<{ items: Letter[]; total: number }>('/notifications/dlq');
    setItems(data.items); setTotal(data.total);
  }
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, []);
  async function act(id: string, method: string) {
    if (method === 'DELETE' && !confirm('Descartar esta notificação definitivamente?')) return;
    setBusy(true); setError('');
    try { await api(`/notifications/dlq/${id}`, { method }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <h1 className="text-4xl font-medium">Notificações com falha</h1>
    <p className="my-4">{total} mensagens. Exibindo até 100 por vez. Reenviar reinicia as tentativas do canal que falhou.</p>
    <ErrorText>{error}</ErrorText>
    <Button disabled={busy} onClick={() => load().catch((e: Error) => setError(e.message))}>Atualizar</Button>
    <div className="mt-6 grid gap-4">{items.map((m) => <article key={m.id} className="rounded border p-4">
      <h2 className="font-semibold">{m.protocol || 'Sem protocolo'} · {m.type}</h2>
      <p className="my-2 break-words">{m.error}</p>
      <div className="flex gap-3"><Button disabled={busy} onClick={() => act(m.id, 'POST')}>Reenviar</Button><Button disabled={busy} onClick={() => act(m.id, 'DELETE')}>Descartar</Button></div>
    </article>)}</div>
  </>;
}
