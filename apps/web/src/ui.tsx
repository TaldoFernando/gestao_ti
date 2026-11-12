import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Equipment, type Sector } from './api';

/** Carrega setores e equipamentos juntos; `reload` depois de qualquer alteração. */
export function useInventory() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = () =>
    Promise.all([api<Sector[]>('/sectors'), api<Equipment[]>('/equipment')])
      .then(([s, e]) => {
        setSectors(s);
        setEquipment(e);
        setError('');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
  }, []);
  return { sectors, equipment, error, loading, reload };
}

/** <dialog> nativo: foco, Esc e backdrop de graça. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(480px,calc(100vw-32px))] rounded-lg p-0 text-ink shadow-2xl backdrop:bg-ink/50">
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-2 -mt-1 size-9 rounded-md text-2xl text-muted hover:bg-black/5 hover:text-ink">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export const input =
  'h-11 w-full min-w-0 rounded-md border border-[#cfcfcf] bg-white px-3 text-[15px] font-normal outline-none transition focus:border-ink focus:ring-2 focus:ring-gold/40';

export function Button({ variant = 'secondary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-gold text-ink hover:brightness-95',
    secondary: 'border border-[#cfcfcf] bg-white hover:border-ink',
    danger: 'bg-[#c2381f] text-white hover:bg-[#9e2c17]',
    ghost: 'text-ink underline-offset-4 hover:underline',
  }[variant];
  return <button className={`h-11 whitespace-nowrap rounded-full px-5 text-sm font-medium transition active:translate-y-px disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Pill({ active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-9 rounded-full border px-4 text-sm transition ${active ? 'border-ink bg-ink text-white' : 'border-[#d6d6d6] hover:border-ink'}`}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="text-sm text-[#c2381f]">{children}</p> : null;
}

/** Confirmação de exclusão; `onConfirm` lança erro para mostrar a mensagem da API. */
export function Confirm({ text, onConfirm, onClose }: { text: string | null; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(''), [text]);
  return (
    <Dialog open={text !== null} onClose={onClose} title="Excluir cadastro?">
      <p className="text-muted">{text}</p>
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Excluir
        </Button>
      </div>
    </Dialog>
  );
}
