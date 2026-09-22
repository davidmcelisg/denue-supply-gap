'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { BuscadorScian } from './BuscadorScian';
import { filtrosToQuery, parseFiltros } from '@/lib/params';
import { DEMANDA_LABEL, ENTIDAD_LABEL, NIVEL_LABEL, ORDEN_LABEL } from '@/lib/format';
import { DEMANDAS, ENTIDADES, NIVELES, ORDENES, type FiltrosExplorar } from '@/lib/types';

// Owns no data. Reads the current URL, pushes a new one. Any change other
// than the page resets `pagina` to 1.
export function FiltrosRail({ scianNombre }: { scianNombre: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const f = parseFiltros(Object.fromEntries(sp.entries()));

  const push = (cambios: Partial<FiltrosExplorar>) =>
    router.push(`/explorar?${filtrosToQuery({ ...f, ...cambios, pagina: 1 })}`);

  const toggleEntidad = (e: string) => {
    const next = f.entidades.includes(e) ? f.entidades.filter((x) => x !== e) : [...f.entidades, e];
    if (next.length) push({ entidades: next.sort() });
  };

  return (
    <aside className="flex flex-col gap-4 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500 mb-1">Categoría</div>
        <div className="mb-1 font-medium leading-snug">
          <span className="font-mono text-xs text-stone-500 mr-1">{f.scianId}</span>
          {scianNombre || <span className="text-stone-400">(no encontrada)</span>}
        </div>
        <BuscadorScian onSelect={(r) => push({ scianId: r.scianId, nivel: r.nivel })} />
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-stone-500">Nivel</span>
        <select value={f.nivel} onChange={(e) => push({ nivel: e.target.value as FiltrosExplorar['nivel'] })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5">
          {NIVELES.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
        </select>
        <span className="text-xs text-stone-400">Cambiar el nivel requiere elegir una categoría de ese nivel.</span>
      </label>

      <fieldset>
        <legend className="text-xs uppercase tracking-wide text-stone-500">Entidades</legend>
        {ENTIDADES.map((e) => (
          <label key={e} className="flex items-center gap-2 mt-1">
            <input type="checkbox" checked={f.entidades.includes(e)} onChange={() => toggleEntidad(e)} />
            {ENTIDAD_LABEL[e]}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="text-xs uppercase tracking-wide text-stone-500">Demanda esperada según</legend>
        {DEMANDAS.map((d) => (
          <label key={d} className="flex items-center gap-2 mt-1">
            <input type="radio" name="demanda" checked={f.demanda === d} onChange={() => push({ demanda: d })} />
            {DEMANDA_LABEL[d]}
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-stone-500">Orden</span>
        <select value={f.orden} onChange={(e) => push({ orden: e.target.value as FiltrosExplorar['orden'] })} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5">
          {ORDENES.map((o) => <option key={o} value={o}>{ORDEN_LABEL[o]}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-stone-500">Población mínima del AGEB</span>
        <input
          type="number" min={500} step={500} defaultValue={f.minPob} key={f.minPob}
          onBlur={(e) => { const v = Number(e.target.value); if (v >= 500 && v !== f.minPob) push({ minPob: v }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
        />
      </label>
    </aside>
  );
}
