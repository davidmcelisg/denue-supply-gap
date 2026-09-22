'use client';
import { useEffect, useRef, useState } from 'react';
import type { NivelScian, ResultadoBusqueda } from '@/lib/types';
import { NIVEL_LABEL } from '@/lib/format';

// Debounced typeahead against /api/scian/buscar. Owns only its input text and
// the dropdown; the selection is handed to the parent, which pushes a URL.
export function BuscadorScian({ nivel, onSelect }: { nivel?: NivelScian; onSelect: (r: ResultadoBusqueda) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ResultadoBusqueda[]>([]);
  const [open, setOpen] = useState(false);
  const [buscado, setBuscado] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      const url = `/api/scian/buscar?q=${encodeURIComponent(q)}${nivel ? `&nivel=${nivel}` : ''}`;
      try {
        const r = await fetch(url, { signal: ac.signal });
        if (r.ok) { setRes(await r.json()); setBuscado(q); setOpen(true); }
      } catch { /* aborted */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q, nivel]);

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) { setRes([]); setOpen(false); } }}
        onFocus={() => res.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar categoría (nombre o código)"
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
      />
      {open && res.length === 0 && buscado === q && q.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded border border-stone-200 bg-white p-2 text-xs text-stone-500 shadow-md">
          Sin resultados. Prueba otra palabra o el código SCIAN.
        </div>
      )}
      {open && res.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded border border-stone-200 bg-white shadow-md text-sm">
          {res.map((r) => (
            <li key={`${r.nivel}-${r.scianId}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(r); setQ(''); setOpen(false); }}
                className="w-full text-left px-2 py-1.5 hover:bg-stone-100"
              >
                <span className="font-mono text-xs text-stone-500 mr-2">{r.scianId}</span>
                {r.scianNombre}
                <span className="ml-2 text-xs text-stone-400">{NIVEL_LABEL[r.nivel]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
