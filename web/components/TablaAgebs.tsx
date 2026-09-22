import Link from 'next/link';
import { BandaBadge } from './Banda';
import { MarcaNoConfiable, TITULO_NO_CONFIABLE } from './Confiable';
import { fmtDec, fmtInt, fmtPct } from '@/lib/format';
import type { Demanda, FilaAgeb, NivelScian } from '@/lib/types';

export function TablaAgebs({ filas, desde, demanda, nivel }: { filas: FilaAgeb[]; desde: number; demanda: Demanda; nivel: NivelScian }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-stone-500 border-b border-stone-200">
        <tr>
          <th className="py-2 pr-2 font-medium">#</th>
          <th className="py-2 pr-2 font-medium">AGEB</th>
          <th className="py-2 pr-2 font-medium">Municipio</th>
          <th className="py-2 pr-2 font-medium">Entidad</th>
          <th className="py-2 pr-2 font-medium text-right">Población</th>
          <th className="py-2 pr-2 font-medium text-right">Estab. total</th>
          <th className="py-2 pr-2 font-medium text-right">Tiene</th>
          <th className="py-2 pr-2 font-medium text-right">Esperados</th>
          <th className="py-2 pr-2 font-medium text-right">Índice</th>
          <th className="py-2 pr-2 font-medium">Banda</th>
          <th className="py-2 pr-2 font-medium text-right">Percentil</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr
            key={f.agebKey}
            title={f.confiable ? undefined : TITULO_NO_CONFIABLE}
            className={`border-b border-stone-100 ${f.confiable ? '' : 'text-stone-400'}`}
          >
            <td className="py-1.5 pr-2 tabular-nums text-stone-400">{desde + i}</td>
            <td className="py-1.5 pr-2 font-mono text-xs">
              <Link href={`/ageb/${f.agebKey}?demanda=${demanda}&nivel=${nivel}`} className="underline decoration-stone-300 hover:decoration-stone-900">
                {f.agebKey}
              </Link>
              {!f.confiable && <MarcaNoConfiable />}
            </td>
            <td className="py-1.5 pr-2">{f.municipioNombre}</td>
            <td className="py-1.5 pr-2 text-stone-600">{f.entidadNombre}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{fmtInt(f.poblacion)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums text-stone-500">{fmtInt(f.nEstabTotalAgeb)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{fmtInt(f.nEstab)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{fmtDec(f.esperado, 1)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtDec(f.indice, 2)}</td>
            <td className="py-1.5 pr-2">{f.confiable ? <BandaBadge banda={f.banda} /> : <span className="text-xs">—</span>}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums text-stone-500">{fmtPct(f.percentil)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
