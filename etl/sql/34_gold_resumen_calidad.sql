-- Figures rendered on /metodologia. Computed here so a DENUE reload cannot
-- leave hardcoded percentages in the page. Percentages are ratios (0–1);
-- the web layer only formats them.
--
-- clave is unique even for per-entidad rows (suffix _09 / _19); entidad_id
-- is filled for those and left NULL for the global flag stats.
DROP TABLE IF EXISTS gold.resumen_calidad CASCADE;

CREATE TABLE gold.resumen_calidad (
  clave      text PRIMARY KEY,
  valor      numeric NOT NULL,
  entidad_id char(2)
);

INSERT INTO gold.resumen_calidad (clave, valor, entidad_id)
WITH flags AS (
  SELECT
    count(*)::numeric AS n,
    count(*) FILTER (WHERE 'clee_inconsistente' = ANY(calidad_flags))::numeric AS n_clee,
    count(*) FILTER (WHERE 'posible_duplicado'  = ANY(calidad_flags))::numeric AS n_dup,
    count(*) FILTER (WHERE 'sin_ageb'           = ANY(calidad_flags))::numeric AS n_sin,
    count(*) FILTER (WHERE 'coord_sospechosa'   = ANY(calidad_flags))::numeric AS n_coord
  FROM silver.establecimiento
),
agebs AS (
  SELECT
    entidad_id,
    count(*) FILTER (WHERE NOT es_elegible)::numeric AS n_no_elegible,
    sum(poblacion) FILTER (WHERE NOT es_elegible)::numeric
      / NULLIF(sum(poblacion), 0) AS pob_share
  FROM silver.ageb
  GROUP BY entidad_id
),
retail AS (
  SELECT entidad_id, tasa_com
  FROM gold.tasa_scian
  WHERE nivel_scian = 'sector' AND scian_id = '46'
)
SELECT clave, valor, entidad_id FROM (
  SELECT 'clee_inconsistente_n'::text,   n_clee,        NULL::char(2) FROM flags
  UNION ALL SELECT 'clee_inconsistente_pct', n_clee / n, NULL FROM flags
  UNION ALL SELECT 'posible_duplicado_n',    n_dup,      NULL FROM flags
  UNION ALL SELECT 'posible_duplicado_pct',  n_dup / n,  NULL FROM flags
  UNION ALL SELECT 'sin_ageb_n',             n_sin,      NULL FROM flags
  UNION ALL SELECT 'sin_ageb_pct',           n_sin / n,  NULL FROM flags
  UNION ALL SELECT 'coord_sospechosa_n',     n_coord,    NULL FROM flags
  UNION ALL SELECT 'coord_sospechosa_pct',   n_coord / n, NULL FROM flags
  UNION ALL SELECT 'ageb_no_elegible_n_' || entidad_id,        n_no_elegible, entidad_id FROM agebs
  UNION ALL SELECT 'ageb_no_elegible_pob_share_' || entidad_id, pob_share,    entidad_id FROM agebs
  UNION ALL SELECT 'retail_share_' || entidad_id,               tasa_com,     entidad_id FROM retail
) x(clave, valor, entidad_id);
