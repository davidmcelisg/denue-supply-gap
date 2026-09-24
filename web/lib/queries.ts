// Query layer. All arithmetic, ranking and aggregation happens in SQL over
// gold tables (PROYECTO.md §0.2). `indice`, `esperado`, `banda`, `percentil`
// are resolved per `demanda` here, never in React.
import { sql } from './db';
import {
  BANDAS, DETALLE_SIZE, PAGE_SIZE,
  type Banda, type Demanda, type DetalleAgeb, type FilaAgeb, type FilaScian,
  type FiltrosExplorar, type NivelScian, type RespuestaAgeb, type ResumenCalidad,
  type RespuestaExplorar, type ResultadoBusqueda,
} from './types';

// Column names for the chosen demand proxy. Only these two shapes exist, so
// the switch is exhaustive and the fragments are safe to inline.
function columnas(demanda: Demanda) {
  return demanda === 'comercial'
    ? { esperado: sql`i.esperado_com`, indice: sql`i.indice_comercial`, percentil: sql`i.percentil_com`, banda: sql`i.banda_com` }
    : { esperado: sql`i.esperado_pob`, indice: sql`i.indice_pob`, percentil: sql`i.percentil_pob`, banda: sql`i.banda_pob` };
}

async function contexto(nivel: NivelScian, scianId: string) {
  const [cfg, nodo, totales] = await Promise.all([
    sql<{ clave: string; valor: string }[]>`SELECT clave, valor FROM gold.config`,
    sql<{ nombre: string }[]>`SELECT nombre FROM gold.scian_nodo WHERE nivel_scian = ${nivel} AND scian_id = ${scianId}`,
    sql<{ entidad_id: string; n_total: number }[]>`
      SELECT entidad_id, n_total FROM gold.tasa_scian WHERE nivel_scian = ${nivel} AND scian_id = ${scianId}`,
  ]);
  const c = Object.fromEntries(cfg.map((r) => [r.clave, r.valor]));
  return {
    scianNombre: nodo[0]?.nombre ?? '',
    nTotalPorEntidad: Object.fromEntries(totales.map((t) => [t.entidad_id, t.n_total])),
    edicionDenue: c.edicion_denue,
    anioCenso: Number(c.anio_censo),
    alpha: Number(c.alpha),
  };
}

export async function explorarPorScian(f: FiltrosExplorar): Promise<RespuestaExplorar> {
  const col = columnas(f.demanda);
  const offset = (f.pagina - 1) * PAGE_SIZE;

  // Non-confiable rows never rank first (§1.4): they sort after all confiable rows.
  const orden = {
    indice_asc: sql`i.confiable DESC, ${col.indice} ASC, i.ageb_key`,
    indice_desc: sql`i.confiable DESC, ${col.indice} DESC, i.ageb_key`,
    poblacion_desc: sql`i.confiable DESC, i.poblacion DESC, i.ageb_key`,
    n_estab_desc: sql`i.confiable DESC, i.n_estab DESC, i.ageb_key`,
  }[f.orden];

  const filtro = sql`
    i.nivel_scian = ${f.nivel} AND i.scian_id = ${f.scianId}
    AND i.entidad_id = ANY(${f.entidades}) AND i.poblacion >= ${f.minPob}`;

  const [filas, resumenRows, bandaRows, ctx] = await Promise.all([
    sql<FilaAgeb[]>`
      SELECT i.ageb_key AS "agebKey", m.nombre AS "municipioNombre", e.nombre AS "entidadNombre",
             i.poblacion, i.n_estab AS "nEstab", i.n_estab_total_ageb AS "nEstabTotalAgeb",
             ${col.esperado} AS esperado, ${col.indice} AS indice, ${col.percentil} AS percentil,
             ${col.banda} AS banda, i.confiable
      FROM gold.indice_suministro i
      JOIN silver.ageb a ON a.ageb_key = i.ageb_key
      JOIN silver.municipio m ON m.id = a.municipio_id
      JOIN silver.entidad e ON e.id = i.entidad_id
      WHERE ${filtro}
      ORDER BY ${orden}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    sql<{ n: number; mediana: number | null }[]>`
      SELECT count(*)::int AS n, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ${col.indice}))::numeric, 4) AS mediana
      FROM gold.indice_suministro i WHERE ${filtro}`,
    sql<{ banda: Banda; n: number }[]>`
      SELECT ${col.banda} AS banda, count(*)::int AS n
      FROM gold.indice_suministro i WHERE ${filtro} GROUP BY 1`,
    contexto(f.nivel, f.scianId),
  ]);

  const conteoPorBanda = Object.fromEntries(BANDAS.map((b) => [b, 0])) as Record<Banda, number>;
  for (const r of bandaRows) conteoPorBanda[r.banda] = r.n;

  return {
    filas,
    total: resumenRows[0].n,
    resumen: { nAgebs: resumenRows[0].n, medianaIndice: resumenRows[0].mediana ?? 0, conteoPorBanda },
    contexto: ctx,
  };
}

// `todas` renders the full ranking; the default is the head of it. At clase
// grain the full list is ~930 rows for one AGEB, nearly all of them zero, so
// the head is what answers "what is missing here".
export async function detallarAgeb(
  agebKey: string, demanda: Demanda, nivel: NivelScian, todas = false,
): Promise<RespuestaAgeb> {
  const col = columnas(demanda);
  const [filas, totales] = await Promise.all([
    sql<FilaScian[]>`
      SELECT i.scian_id AS "scianId", n.nombre AS "scianNombre", i.nivel_scian AS nivel,
             i.n_estab AS "nEstab", ${col.esperado} AS esperado, ${col.indice} AS indice,
             ${col.percentil} AS percentil, ${col.banda} AS banda, i.confiable
      FROM gold.indice_suministro i
      JOIN gold.scian_nodo n ON n.nivel_scian = i.nivel_scian AND n.scian_id = i.scian_id
      WHERE i.ageb_key = ${agebKey} AND i.nivel_scian = ${nivel}
      ORDER BY i.confiable DESC, ${col.indice} ASC, i.scian_id
      ${todas ? sql`` : sql`LIMIT ${DETALLE_SIZE}`}`,
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM gold.indice_suministro
      WHERE ageb_key = ${agebKey} AND nivel_scian = ${nivel}`,
  ]);
  return { filas, total: totales[0].n };
}

// Cambiar de nivel conserva la categoría: SCIAN es una jerarquía estricta, así
// que 461110 (clase) sube a 461 (subsector) y a 46 (sector). Bajando no hay una
// sola respuesta, así que se toma el hijo con más establecimientos en las
// entidades seleccionadas, que es el representante útil del nodo.
// Devuelve null si la categoría no existe en el catálogo.
export async function resolverNivel(
  nivel: NivelScian, scianId: string, entidades: string[],
): Promise<string | null> {
  const rows = await sql<{ scian_id: string }[]>`
    WITH actual AS (
      -- el código identifica el nodo sin ambigüedad: los niveles tienen largos distintos
      SELECT nivel_scian, scian_id, padre_id FROM gold.scian_nodo WHERE scian_id = ${scianId}
    ),
    linaje AS (
      SELECT
        CASE a.nivel_scian
          WHEN 'sector'    THEN a.scian_id
          WHEN 'subsector' THEN a.padre_id
          ELSE (SELECT p.padre_id FROM gold.scian_nodo p
                 WHERE p.nivel_scian = 'subsector' AND p.scian_id = a.padre_id)
        END AS sector_id,
        CASE a.nivel_scian
          WHEN 'sector'    THEN NULL
          WHEN 'subsector' THEN a.scian_id
          ELSE a.padre_id
        END AS subsector_id
      FROM actual a
    )
    SELECT n.scian_id
    FROM gold.scian_nodo n
    CROSS JOIN linaje l
    LEFT JOIN gold.tasa_scian t
      ON t.nivel_scian = n.nivel_scian AND t.scian_id = n.scian_id
     AND t.entidad_id = ANY(${entidades})
    WHERE n.nivel_scian = ${nivel}
      AND CASE ${nivel}
        WHEN 'sector'    THEN n.scian_id = l.sector_id
        WHEN 'subsector' THEN n.scian_id = l.subsector_id OR (l.subsector_id IS NULL AND n.padre_id = l.sector_id)
        ELSE n.padre_id = l.subsector_id
          OR (l.subsector_id IS NULL AND n.padre_id IN (
                SELECT scian_id FROM gold.scian_nodo
                WHERE nivel_scian = 'subsector' AND padre_id = l.sector_id))
      END
    GROUP BY n.scian_id
    -- si la categoría ya existe en el nivel pedido, se queda tal cual
    ORDER BY (n.scian_id = ${scianId}) DESC, sum(coalesce(t.n_total, 0)) DESC, n.scian_id
    LIMIT 1`;
  return rows[0]?.scian_id ?? null;
}

export async function obtenerAgeb(agebKey: string): Promise<DetalleAgeb | null> {
  const rows = await sql<DetalleAgeb[]>`
    SELECT a.ageb_key AS "agebKey", m.nombre AS "municipioNombre", a.entidad_id AS "entidadId",
           e.nombre AS "entidadNombre", a.poblacion,
           g.n_estab_total_ageb AS "nEstabTotalAgeb",
           a.es_elegible AS "esElegible"
    FROM silver.ageb a
    JOIN silver.municipio m ON m.id = a.municipio_id
    JOIN silver.entidad e ON e.id = a.entidad_id
    -- establishment total is a gold value; non-eligible AGEBs have no gold rows (NULL)
    LEFT JOIN LATERAL (
      SELECT n_estab_total_ageb FROM gold.conteo_ageb_scian c WHERE c.ageb_key = a.ageb_key LIMIT 1
    ) g ON true
    WHERE a.ageb_key = ${agebKey}`;
  return rows[0] ?? null;
}

// Typeahead: accent-insensitive. Matches code/official name, or an everyday
// synonym in gold.scian_sinonimo (those rank above name hits).
export async function buscarScian(q: string, nivel?: NivelScian): Promise<ResultadoBusqueda[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return sql<ResultadoBusqueda[]>`
    SELECT n.scian_id AS "scianId", n.nombre AS "scianNombre", n.nivel_scian AS nivel
    FROM gold.scian_nodo n
    LEFT JOIN LATERAL (
      SELECT true AS hit
      FROM gold.scian_sinonimo s
      WHERE s.nivel_scian = n.nivel_scian AND s.scian_id = n.scian_id
        AND lower(unaccent(s.sinonimo)) ILIKE '%' || lower(unaccent(${term})) || '%'
      LIMIT 1
    ) syn ON true
    WHERE (n.busqueda ILIKE '%' || lower(unaccent(${term})) || '%' OR syn.hit)
      AND (${nivel ?? null}::text IS NULL OR n.nivel_scian = ${nivel ?? null})
    ORDER BY syn.hit DESC NULLS LAST,
             (n.scian_id LIKE ${term + '%'}) DESC,
             array_position(ARRAY['sector','subsector','clase'], n.nivel_scian),
             n.scian_id
    LIMIT 20`;
}

export async function obtenerContexto() {
  const cfg = await sql<{ clave: string; valor: string }[]>`SELECT clave, valor FROM gold.config`;
  const c = Object.fromEntries(cfg.map((r) => [r.clave, r.valor]));
  return { edicionDenue: c.edicion_denue, anioCenso: Number(c.anio_censo), alpha: Number(c.alpha), minConfiable: Number(c.min_confiable), minPoblacion: Number(c.min_poblacion) };
}

export async function obtenerResumenCalidad(): Promise<ResumenCalidad> {
  const rows = await sql<{ clave: string; valor: number }[]>`
    SELECT clave, valor FROM gold.resumen_calidad`;
  const v = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  const need = (k: string) => {
    const x = v[k];
    if (x == null) throw new Error(`gold.resumen_calidad missing ${k}`);
    return x;
  };
  return {
    cleeInconsistentePct: need('clee_inconsistente_pct'),
    posibleDuplicadoPct: need('posible_duplicado_pct'),
    sinAgebPct: need('sin_ageb_pct'),
    coordSospechosaN: need('coord_sospechosa_n'),
    agebNoElegibleN: { '09': need('ageb_no_elegible_n_09'), '19': need('ageb_no_elegible_n_19') },
    agebNoElegiblePobShare: {
      '09': need('ageb_no_elegible_pob_share_09'),
      '19': need('ageb_no_elegible_pob_share_19'),
    },
    retailShare: { '09': need('retail_share_09'), '19': need('retail_share_19') },
  };
}
