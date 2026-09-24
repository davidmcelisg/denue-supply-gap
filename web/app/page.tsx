import Link from 'next/link';
import { hrefExplorar } from '@/lib/params';
import { obtenerContexto } from '@/lib/queries';

// Read gold at request time. Prerendering would freeze `contexto` (and the
// figures on /metodologia) at build time, so an ETL rebuild would not show.
export const dynamic = 'force-dynamic';

// Curated findings: AGEBs and categories validated by hand in Phase 3
// (PROYECTO.md T3.3 spot-check). Each link is a fully prefilled URL.
const HALLAZGOS = [
  {
    titulo: 'Tiendas de abarrotes en Nuevo León',
    texto: 'Los 25 AGEB con el índice más bajo tienen cero tiendas de abarrotes y entre 15 y 24 esperadas. Están en Monterrey (13), San Pedro Garza García (5) y General Escobedo (3). Es un patrón de urbanismo, no necesariamente demanda insatisfecha: el índice lo muestra, la interpretación es tuya.',
    href: hrefExplorar({ entidades: ['19'], nivel: 'clase', scianId: '461110', orden: 'indice_asc' }),
  },
  {
    titulo: 'Cafeterías en Ciudad de México',
    texto: 'Los AGEB más sub-ofertados son tractos grandes de Iztapalapa, Gustavo A. Madero y Xochimilco: 11 a 14 cafeterías esperadas, cero registradas. En el otro extremo, el AGEB de Roma Norte tiene 28 contra 4.6 esperadas, 5.2 veces la tasa típica.',
    href: hrefExplorar({ entidades: ['09'], nivel: 'clase', scianId: '722515', orden: 'indice_asc' }),
  },
  {
    titulo: 'Polanco: población vs. actividad comercial',
    texto: 'Por habitantes, Polanco tiene 2.6× los restaurantes típicos. Pero relativo a su propia masa comercial (1,070 establecimientos para 4,030 residentes) los restaurantes son una fracción menor que en un AGEB típico. Cambiar la base de demanda cambia la lectura, y eso es intencional.',
    href: '/ageb/0901600010158?demanda=comercial&nivel=clase',
  },
];

export default async function Home() {
  const ctx = await obtenerContexto();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">¿Qué categorías de negocio sobran o faltan en cada AGEB?</h1>
      <p className="mt-3 text-stone-700 leading-relaxed">
        Para cada AGEB urbano de Ciudad de México y Nuevo León, y cada categoría SCIAN, comparamos cuántos
        establecimientos hay contra cuántos <em>habría</em> si ese AGEB tuviera la tasa típica de su entidad
        (establecimientos por habitante, o por establecimiento total). El cociente es el índice: menor a 1 es
        sub-oferta, mayor a 1 es sobre-oferta. Fuente: DENUE {ctx.edicionDenue} y Censo {ctx.anioCenso}.
        Es oferta relativa: DENUE no tiene ingresos, tráfico ni rentabilidad.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/explorar" className="rounded border border-stone-300 p-4 hover:border-stone-900">
          <div className="font-medium">Explorar por categoría →</div>
          <div className="text-sm text-stone-600 mt-1">Fija una categoría y ordena los AGEB de más faltante a más saturado.</div>
        </Link>
        <Link href="/ageb/1903900014233?demanda=poblacion&nivel=clase" className="rounded border border-stone-300 p-4 hover:border-stone-900">
          <div className="font-medium">Explorar por AGEB →</div>
          <div className="text-sm text-stone-600 mt-1">Fija un lugar y ve qué categorías le faltan. Ejemplo: Cumbres, Monterrey.</div>
        </Link>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Tres hallazgos para empezar</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {HALLAZGOS.map((h) => (
          <li key={h.href} className="border-l-2 border-stone-300 pl-4">
            <Link href={h.href} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">{h.titulo}</Link>
            <p className="text-sm text-stone-600 mt-1 leading-relaxed">{h.texto}</p>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-stone-500">
        Detalles del método, umbrales y limitaciones en <Link href="/metodologia" className="underline">Metodología</Link>.
      </p>
    </div>
  );
}
