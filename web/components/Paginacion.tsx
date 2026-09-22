import Link from 'next/link';
import { filtrosToQuery } from '@/lib/params';
import { fmtInt } from '@/lib/format';
import type { FiltrosExplorar } from '@/lib/types';

export function Paginacion({ f, total, desde, hasta, hayMas }: { f: FiltrosExplorar; total: number; desde: number; hasta: number; hayMas: boolean }) {
  const cls = 'rounded border border-stone-300 px-2 py-1 text-sm';
  const off = 'rounded border border-stone-200 px-2 py-1 text-sm text-stone-300';
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-stone-600">
      <span>Mostrando {fmtInt(desde)}–{fmtInt(hasta)} de {fmtInt(total)} AGEB</span>
      <div className="flex gap-2">
        {f.pagina > 1 ? <Link className={cls} href={`/explorar?${filtrosToQuery({ ...f, pagina: f.pagina - 1 })}`}>← Anterior</Link> : <span className={off}>← Anterior</span>}
        {hayMas ? <Link className={cls} href={`/explorar?${filtrosToQuery({ ...f, pagina: f.pagina + 1 })}`}>Siguiente →</Link> : <span className={off}>Siguiente →</span>}
      </div>
    </div>
  );
}
