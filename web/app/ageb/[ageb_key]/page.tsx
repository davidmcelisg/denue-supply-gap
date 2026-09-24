import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BandaBadge } from '@/components/Banda';
import { MarcaNoConfiable, TITULO_NO_CONFIABLE } from '@/components/Confiable';
import { NotaVigencia } from '@/components/NotaVigencia';
import { DEMANDA_LABEL, NIVEL_LABEL, fmtDec, fmtInt, fmtPct } from '@/lib/format';
import { hrefExplorar, parseDemanda, parseNivel } from '@/lib/params';
import { detallarAgeb, obtenerAgeb, obtenerContexto } from '@/lib/queries';
import { DEMANDAS, DETALLE_SIZE, NIVELES } from '@/lib/types';

export default async function AgebPage({ params, searchParams }: PageProps<'/ageb/[ageb_key]'>) {
  const { ageb_key } = await params;
  const sp = await searchParams;
  const demanda = parseDemanda(sp.demanda);
  const nivel = parseNivel(sp.nivel);
  const todas = (Array.isArray(sp.todas) ? sp.todas[0] : sp.todas) === '1';

  const ageb = await obtenerAgeb(ageb_key);
  if (!ageb) notFound();
  const [detalle, ctx] = await Promise.all([detallarAgeb(ageb_key, demanda, nivel, todas), obtenerContexto()]);
  const { filas, total } = detalle;

  const href = (d: typeof demanda, n: typeof nivel) =>
    `/ageb/${ageb_key}?demanda=${d}&nivel=${n}${todas ? '&todas=1' : ''}`;
  const chip = (active: boolean) =>
    `rounded border px-2 py-0.5 text-xs ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-500'}`;

  return (
    <div>
      <p className="text-xs text-stone-500 mb-1">AGEB <span className="font-mono">{ageb.agebKey}</span></p>
      <h1 className="text-xl font-semibold leading-tight">¿Qué falta en {ageb.municipioNombre}, {ageb.entidadNombre}?</h1>
      <p className="text-sm text-stone-600 mt-1">
        {fmtInt(ageb.poblacion)} habitantes (Censo {ctx.anioCenso})
        {ageb.nEstabTotalAgeb !== null && <> · {fmtInt(ageb.nEstabTotalAgeb)} establecimientos (DENUE {ctx.edicionDenue})</>}
      </p>

      {!ageb.esElegible && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Este AGEB tiene menos de {fmtInt(ctx.minPoblacion)} habitantes y queda fuera del cálculo del índice.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-stone-500 mr-1">Nivel</span>
          {NIVELES.map((n) => <Link key={n} href={href(demanda, n)} className={chip(n === nivel)}>{NIVEL_LABEL[n]}</Link>)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-stone-500 mr-1">Demanda según</span>
          {DEMANDAS.map((d) => <Link key={d} href={href(d, nivel)} className={chip(d === demanda)}>{DEMANDA_LABEL[d]}</Link>)}
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="mt-8 rounded border border-dashed border-stone-300 p-6 text-sm text-stone-600">Sin categorías calculadas para este AGEB.</div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500 border-b border-stone-200">
              <tr>
                <th className="py-2 pr-2 font-medium">Categoría</th>
                <th className="py-2 pr-2 font-medium text-right">Tiene</th>
                <th className="py-2 pr-2 font-medium text-right">Esperados</th>
                <th className="py-2 pr-2 font-medium text-right">Índice</th>
                <th className="py-2 pr-2 font-medium">Banda</th>
                <th className="py-2 pr-2 font-medium text-right">Percentil</th>
                <th className="py-2 pr-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.scianId} title={r.confiable ? undefined : TITULO_NO_CONFIABLE} className={`border-b border-stone-100 ${r.confiable ? '' : 'text-stone-400'}`}>
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-xs text-stone-500 mr-2">{r.scianId}</span>{r.scianNombre}
                    {!r.confiable && <MarcaNoConfiable />}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{fmtInt(r.nEstab)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtDec(r.esperado, 1)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtDec(r.indice, 2)}</td>
                  <td className="py-1.5 pr-2">{r.confiable ? <BandaBadge banda={r.banda} /> : <span className="text-xs">—</span>}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-stone-500">{fmtPct(r.percentil)}</td>
                  <td className="py-1.5 pr-2 text-xs">
                    <Link href={hrefExplorar({ entidades: [ageb.entidadId], nivel: r.nivel, scianId: r.scianId, demanda })} className="text-stone-500 underline decoration-stone-300 hover:text-stone-900">
                      ver en la entidad
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-stone-500">
            Ordenado de más faltante a más saturado. Índice = (tiene + α) / (esperados + α); el percentil es la posición de este AGEB entre todos los de su entidad para esa categoría.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {todas ? (
              <>
                Mostrando las {fmtInt(total)} categorías evaluadas.{' '}
                <Link href={`/ageb/${ageb_key}?demanda=${demanda}&nivel=${nivel}`} className="underline">Ver solo las primeras {fmtInt(DETALLE_SIZE)}</Link>
              </>
            ) : (
              <>
                Mostrando las {fmtInt(DETALLE_SIZE)} categorías con menor índice de {fmtInt(total)} evaluadas. La cola son categorías sin
                presencia en este AGEB y con muy pocos esperados.{' '}
                <Link href={`/ageb/${ageb_key}?demanda=${demanda}&nivel=${nivel}&todas=1`} className="underline">Ver todas</Link>
              </>
            )}
          </p>
        </div>
      )}

      <NotaVigencia edicionDenue={ctx.edicionDenue} anioCenso={ctx.anioCenso} alpha={ctx.alpha} />
    </div>
  );
}
