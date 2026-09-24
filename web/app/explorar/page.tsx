import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { FiltrosRail } from '@/components/FiltrosRail';
import { NotaVigencia } from '@/components/NotaVigencia';
import { Paginacion } from '@/components/Paginacion';
import { ResumenBandas } from '@/components/ResumenBandas';
import { TablaAgebs } from '@/components/TablaAgebs';
import { fmtDec, fmtInt, ENTIDAD_LABEL, NIVEL_LABEL, DEMANDA_LABEL } from '@/lib/format';
import { hrefExplorar, parseFiltros } from '@/lib/params';
import { explorarPorScian, resolverNivel } from '@/lib/queries';
import { PAGE_SIZE } from '@/lib/types';

export default async function ExplorarPage({ searchParams }: PageProps<'/explorar'>) {
  const f = parseFiltros(await searchParams);

  // Cambiar de nivel conserva la categoría subiendo o bajando por la jerarquía
  // SCIAN. Se redirige para que la URL quede canónica: lo que se ve y lo que
  // dice la barra de direcciones nunca difieren.
  const scianResuelto = await resolverNivel(f.nivel, f.scianId, f.entidades);
  if (scianResuelto && scianResuelto !== f.scianId) {
    redirect(hrefExplorar({ ...f, scianId: scianResuelto }));
  }

  const r = await explorarPorScian(f);

  // Page bookkeeping only (positions, not metrics).
  const desde = (f.pagina - 1) * PAGE_SIZE + 1;
  const hasta = desde + r.filas.length - 1;
  const hayMas = hasta < r.total;

  // Empty-state distinction (Phase 5 UI rules): the category may simply not
  // exist in the selected entidades, or the filters may exclude every AGEB.
  const nEnEntidades = f.entidades.reduce((s, e) => s + (r.contexto.nTotalPorEntidad[e] ?? 0), 0);
  const categoriaAusente = !r.contexto.scianNombre || nEnEntidades === 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
      <Suspense>
        <FiltrosRail scianNombre={r.contexto.scianNombre} />
      </Suspense>

      <section>
        <h1 className="text-xl font-semibold leading-tight">
          ¿Dónde falta <span className="text-stone-600">{r.contexto.scianNombre || f.scianId}</span>?
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {NIVEL_LABEL[f.nivel]} {f.scianId} · demanda por {DEMANDA_LABEL[f.demanda].toLowerCase()} ·{' '}
          {f.entidades.map((e) => `${ENTIDAD_LABEL[e]}: ${fmtInt(r.contexto.nTotalPorEntidad[e] ?? 0)} establecimientos`).join(' · ')}
        </p>

        {r.total === 0 ? (
          <div className="mt-8 rounded border border-dashed border-stone-300 p-6 text-sm text-stone-600">
            {categoriaAusente
              ? <>Esta categoría no tiene establecimientos en {f.entidades.map((e) => ENTIDAD_LABEL[e]).join(' ni ')}. Prueba otra categoría o el nivel superior.</>
              : <>Ningún AGEB coincide con estos filtros (población mínima {fmtInt(f.minPob)}). Baja la población mínima o agrega una entidad.</>}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-start">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-stone-500">AGEB evaluadas</dt>
                <dd className="tabular-nums text-right">{fmtInt(r.resumen.nAgebs)}</dd>
                <dt className="text-stone-500">Índice mediano</dt>
                <dd className="tabular-nums text-right">{fmtDec(r.resumen.medianaIndice, 2)}</dd>
              </dl>
              <div className="max-w-sm"><ResumenBandas conteo={r.resumen.conteoPorBanda} total={r.resumen.nAgebs} /></div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <TablaAgebs filas={r.filas} desde={desde} demanda={f.demanda} nivel={f.nivel} />
            </div>
            <Paginacion f={f} total={r.total} desde={desde} hasta={hasta} hayMas={hayMas} />
            <p className="mt-3 text-xs text-stone-500">
              Índice = (tiene + α) / (esperados + α). Esperados = lo que tendría este AGEB si tuviera la tasa típica de su entidad.
              Filas en gris: categoría no confiable en su entidad (&lt; 30 establecimientos); nunca se ordenan primero.
            </p>
          </>
        )}

        <NotaVigencia {...r.contexto} />
      </section>
    </div>
  );
}
