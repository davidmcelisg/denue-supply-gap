import { obtenerContexto } from '@/lib/queries';
import { BandaBadge } from '@/components/Banda';

export default async function Metodologia() {
  const ctx = await obtenerContexto();
  return (
    <article className="max-w-3xl leading-relaxed text-stone-800">
      <h1 className="text-2xl font-semibold tracking-tight">Metodología</h1>

      <h2 className="mt-8 text-lg font-semibold">Fuentes</h2>
      <ul className="list-disc pl-5 mt-2 text-sm">
        <li><strong>Establecimientos:</strong> DENUE (INEGI), edición {ctx.edicionDenue}, archivos de descarga masiva para las entidades 09 y 19. Cada registro trae la clave de AGEB.</li>
        <li><strong>Población:</strong> Censo de Población y Vivienda {ctx.anioCenso}, resultados por AGEB urbana. Solo AGEB con ≥ {ctx.minPoblacion} habitantes entran al cálculo.</li>
        <li><strong>Clasificación:</strong> SCIAN México 2023. Se exponen tres niveles: sector (2 dígitos), subsector (3) y clase (6).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">El índice</h2>
      <p className="mt-2 text-sm">Para un AGEB <em>a</em>, una categoría <em>s</em> y su entidad <em>e</em>:</p>
      <pre className="mt-2 rounded bg-stone-50 border border-stone-200 p-3 text-xs overflow-x-auto">{`tasa(s,e)      = establecimientos de s en e / población de e
esperado(a,s)  = población(a) × tasa(s,e)
índice(a,s)    = (n(a,s) + α) / (esperado(a,s) + α)        α = ${ctx.alpha}`}</pre>
      <p className="mt-2 text-sm">
        Es un cociente de localización con suavizado. Los totales por entidad se calculan solo sobre AGEB elegibles, de modo que
        la suma de esperados iguala la suma de observados para cada categoría (comprobado en cada reconstrucción).
      </p>
      <p className="mt-2 text-sm">
        <strong>Variante comercial.</strong> Sustituye población por el total de establecimientos del AGEB como proxy de demanda:
        <code className="text-xs"> esperado_com = total_estab(a) × N(s,e) / N_total(e)</code>. Es la lectura adecuada donde la población
        diurna y residencial divergen (Centro Histórico, Santa Fe, San Pedro).
      </p>
      <p className="mt-2 text-sm">
        <strong>Por qué α.</strong> Un AGEB que espera 0.2 cafeterías y tiene 1 marcaría 5.0 sin suavizado. El pseudo-conteo acerca a 1
        los índices con muestras pequeñas. <strong>Por qué no una mediana:</strong> para la mayoría de las clases el AGEB mediano tiene cero
        establecimientos; la tasa por habitante evita dividir entre cero.
      </p>
      <p className="mt-2 text-sm">
        <strong>Bases por entidad.</strong> CDMX y Nuevo León se comparan cada una contra sí misma; sus economías difieren
        (por ejemplo, el comercio al por menor es 45 % de los establecimientos en CDMX y 35 % en NL).
      </p>
      <p className="mt-2 text-sm">
        <strong>Regla de grano.</strong> El índice de un sector se calcula con conteos a nivel sector, no agregando índices de sus clases.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Bandas</h2>
      <p className="mt-2 text-sm">Umbrales fijos sobre el índice, no percentiles: así una banda solo se llena si hay brechas reales.</p>
      <table className="mt-2 text-sm">
        <tbody>
          <tr><td className="pr-4 py-0.5"><BandaBadge banda="muy_bajo" /></td><td className="tabular-nums">índice &lt; 0.5</td></tr>
          <tr><td className="pr-4 py-0.5"><BandaBadge banda="bajo" /></td><td className="tabular-nums">0.5 – 0.8</td></tr>
          <tr><td className="pr-4 py-0.5"><BandaBadge banda="normal" /></td><td className="tabular-nums">0.8 – 1.25</td></tr>
          <tr><td className="pr-4 py-0.5"><BandaBadge banda="alto" /></td><td className="tabular-nums">1.25 – 2.0</td></tr>
          <tr><td className="pr-4 py-0.5"><BandaBadge banda="muy_alto" /></td><td className="tabular-nums">≥ 2.0</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm">El percentil se guarda aparte, como contexto de ranking dentro de (entidad, categoría).</p>

      <h2 className="mt-8 text-lg font-semibold">Confianza</h2>
      <p className="mt-2 text-sm">
        Una categoría es <em>confiable</em> en una entidad si tiene al menos {ctx.minConfiable} establecimientos ahí. Por debajo, la tasa base es
        demasiado ruidosa: esas filas se muestran en gris, sin banda, y nunca ocupan el primer lugar.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Limitaciones</h2>
      <ol className="list-decimal pl-5 mt-2 text-sm flex flex-col gap-1.5">
        <li><strong>Sin ingresos, tráfico ni rentabilidad.</strong> DENUE no los tiene. El producto afirma solo oferta relativa, nunca desempeño de negocios.</li>
        <li><strong>Gravedad comercial.</strong> La población residencial representa mal la demanda donde la población diurna es muy distinta. Para eso existe la variante comercial.</li>
        <li><strong>Vigencias distintas.</strong> DENUE {ctx.edicionDenue} contra población de {ctx.anioCenso}. El índice compara oferta actual con población de hace varios años.</li>
        <li><strong>El estrato es un rango,</strong> no una plantilla exacta. Nunca se muestran estimaciones puntuales de empleo.</li>
        <li><strong>Solo AGEB urbanas.</strong> Los establecimientos en localidades rurales no se unen a un AGEB del Censo y quedan fuera (≈ 0.6 % de los registros; concentrados en municipios periféricos como Tlalpan, Milpa Alta, García y Zuazua). Además, los AGEB con menos de {ctx.minPoblacion} habitantes se excluyen: en Nuevo León son muchos (716) pero suman ≈ 2 % de la población.</li>
      </ol>

      <h2 className="mt-8 text-lg font-semibold">Calidad de datos</h2>
      <p className="mt-2 text-sm">
        Ningún registro se borra por calidad; se marca. Marcas actuales: clave CLEE inconsistente con las columnas (13.6 %, casi siempre
        reclasificación de actividad posterior a la creación de la clave), posible duplicado (3.4 %: mismo nombre normalizado a &lt; 50 m,
        nunca fusionado), sin AGEB (0.6 %) y coordenadas fuera de la entidad (8 registros). Nombres normalizados: mayúsculas, sin acentos,
        sin sufijos legales (S.A. de C.V., S. de R.L., etc.); los originales se conservan.
      </p>
    </article>
  );
}
