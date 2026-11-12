import { useState } from 'react';
import { Link } from 'react-router';

// Paleta categórica (skill dataviz), validada no fundo branco: CVD e visão normal passam.
// Três cores ficam abaixo de 3:1 de contraste → toda fatia tem rótulo visível na legenda (nome, quantidade, %).
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER = '#8a8a8a';

export type Slice = { label: string; value: number };

/** Agrupa por chave, ordena do maior para o menor e junta o que passar de 6 em "Outros". */
export function topSlices(keys: string[], max = SERIES.length): Slice[] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const sorted = [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1).reduce((n, s) => n + s.value, 0);
  return [...sorted.slice(0, max - 1), { label: 'Outros', value: rest }];
}

const colorOf = (s: Slice, i: number) => (s.label === 'Outros' ? OTHER : SERIES[i]);
const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

/**
 * Rosca com o total no centro. Passar o mouse (ou o foco do teclado) numa fatia ou na legenda
 * mostra aquela categoria no centro e esmaece as outras. A legenda é a tabela de valores.
 */
export function Donut({ slices, unit, linkTo }: { slices: Slice[]; unit: [string, string]; linkTo?: (label: string) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  const GAP = slices.length > 1 ? 2 : 0; // 2px de fundo entre fatias
  let offset = 0;
  const shown = active === null ? null : slices[active];

  return (
    <div className="grid items-center gap-8 sm:grid-cols-[180px_1fr]">
      <svg viewBox="0 0 180 180" className="mx-auto w-44 sm:w-full" role="img" aria-label={`${total} ${unit[1]}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <g transform="rotate(-90 90 90)">
          <circle cx="90" cy="90" r={R} fill="none" stroke="#f0f0f0" strokeWidth="22" />
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const dash = Math.max(0, len - GAP);
            const el = (
              <circle
                key={s.label}
                cx="90" cy="90" r={R} fill="none"
                stroke={colorOf(s, i)} strokeWidth={active === i ? 26 : 22}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                opacity={active === null || active === i ? 1 : 0.25}
                className="cursor-pointer transition-[opacity,stroke-width] duration-150"
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              >
                <title>{`${s.label}: ${s.value} (${pct(s.value, total)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="90" y="88" textAnchor="middle" className="fill-ink font-mono" fontSize="34" letterSpacing="-1.5">{shown ? shown.value : total}</text>
        <text x="90" y="110" textAnchor="middle" className="fill-muted font-sans" fontSize="12">
          {shown ? (shown.label.length > 18 ? shown.label.slice(0, 17) + '…' : shown.label) : unit[total === 1 ? 0 : 1]}
        </text>
      </svg>

      <ul className="grid gap-0.5">
        {slices.map((s, i) => {
          const body = (
            <>
              <span className="size-3 shrink-0 rounded-sm" style={{ background: colorOf(s, i) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-mono">{s.value}</span>
              <span className="w-10 text-right font-mono text-sm text-muted">{pct(s.value, total)}%</span>
            </>
          );
          const cls = `flex h-9 items-center gap-3 rounded-md px-2 transition-colors ${active === i ? 'bg-[#f4f4f4]' : ''}`;
          const events = { onMouseEnter: () => setActive(i), onMouseLeave: () => setActive(null), onFocus: () => setActive(i), onBlur: () => setActive(null) };
          return (
            <li key={s.label}>
              {linkTo && s.label !== 'Outros' ? <Link to={linkTo(s.label)} className={cls} {...events}>{body}</Link> : <div className={cls} {...events} tabIndex={0}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barras horizontais de uma série só (cor de texto, sem significado de cor). */
export function Bars({ rows, linkTo }: { rows: { label: string; value: number; key: string }[]; linkTo: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1">
      {rows.map((r) => (
        <li key={r.key}>
          <Link to={linkTo(r.key)} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-md px-2 py-2 transition-colors hover:bg-[#f4f4f4]" title={`${r.label}: ${r.value}`}>
            <span className="truncate group-hover:underline">{r.label}</span>
            <span className="font-mono">{r.value}</span>
            <span className="col-span-2 h-2 rounded-full bg-[#f0f0f0]">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 8 : 0 }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Barra 100% com duas partes e os rótulos sempre visíveis. */
export function Split({ parts }: { parts: Slice[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-[#f0f0f0]" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value).map((p, i) => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i] }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-baseline gap-2">
            <span className="size-3 self-center rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
            <dt className="text-muted">{p.label}</dt>
            <dd className="font-mono">{p.value}</dd>
            <dd className="font-mono text-sm text-muted">{pct(p.value, total)}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
