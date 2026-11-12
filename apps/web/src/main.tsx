import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function App() {
  const [api, setApi] = useState('verificando…');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setApi(d.status))
      .catch(() => setApi('fora do ar'));
  }, []);

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr] bg-white font-sans text-ink">
      <aside className="flex flex-col gap-1 bg-ink px-5 py-6 text-[#9a9a9a]">
        <b className="mb-6 text-lg font-semibold text-white">TI Prefeitura</b>
        <span className="py-2 text-white before:mr-2.5 before:inline-block before:h-0.5 before:w-3.5 before:bg-gold before:align-middle">Visão geral</span>
      </aside>
      <main className="px-9 py-8">
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Patrimônio de TI. <span className="text-muted">Esqueleto no ar.</span>
        </h1>
        <p className="mt-6 font-mono text-sm">API: {api}</p>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
