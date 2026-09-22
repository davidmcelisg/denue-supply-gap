-- Counts of establishments per (eligible AGEB × SCIAN node), at three grains.
-- Includes explicit zero rows: eligible AGEBs × nodes present in the entidad,
-- left-joined to counts. Eligible scope = establishments whose AGEB exists in
-- silver.ageb with es_elegible = true (PROYECTO.md Phase 3).
-- Cross-join sizes logged in T3.1: 09 ≈ 2.4M rows, 19 ≈ 2.0M rows at clase
-- grain — manageable, so clase rows are NOT restricted to confiable clases.

DROP TABLE IF EXISTS gold.conteo_ageb_scian CASCADE;

-- Each eligible establishment resolved to its node id at each grain.
CREATE TEMP TABLE est_nivel AS
SELECT e.ageb_key, a.entidad_id, x.nivel_scian, x.scian_id
FROM silver.establecimiento e
JOIN silver.ageb a ON a.ageb_key = e.ageb_key AND a.es_elegible
JOIN silver.scian_clase c   ON c.id  = e.clase_id
JOIN silver.scian_subrama sr ON sr.id = c.subrama_id
JOIN silver.scian_rama r     ON r.id  = sr.rama_id
JOIN silver.scian_subsector ss ON ss.id = r.subsector_id
CROSS JOIN LATERAL (VALUES
  ('sector',    ss.sector_id),
  ('subsector', ss.id),
  ('clase',     c.id)
) AS x(nivel_scian, scian_id);

CREATE TEMP TABLE ageb_tot AS
SELECT a.ageb_key, a.entidad_id, a.poblacion, count(e.clee)::int AS n_estab_total_ageb
FROM silver.ageb a
LEFT JOIN silver.establecimiento e ON e.ageb_key = a.ageb_key
WHERE a.es_elegible
GROUP BY 1, 2, 3;

CREATE TABLE gold.conteo_ageb_scian AS
WITH nodos AS (
  SELECT DISTINCT entidad_id, nivel_scian, scian_id FROM est_nivel
),
conteo AS (
  SELECT ageb_key, nivel_scian, scian_id, count(*)::int AS n_estab
  FROM est_nivel GROUP BY 1, 2, 3
)
SELECT
  t.ageb_key,
  t.entidad_id,
  n.nivel_scian,
  n.scian_id,
  coalesce(c.n_estab, 0) AS n_estab,
  t.poblacion,
  t.n_estab_total_ageb
FROM ageb_tot t
JOIN nodos n ON n.entidad_id = t.entidad_id
LEFT JOIN conteo c ON c.ageb_key = t.ageb_key
                   AND c.nivel_scian = n.nivel_scian
                   AND c.scian_id = n.scian_id;

ALTER TABLE gold.conteo_ageb_scian
  ADD PRIMARY KEY (nivel_scian, scian_id, ageb_key);
CREATE INDEX ON gold.conteo_ageb_scian (ageb_key);

DROP TABLE est_nivel, ageb_tot;
