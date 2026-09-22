-- Entidad-wide baseline rates per SCIAN node (PROYECTO.md §1.1).
--   tasa_pob = N(s,e) / P(e)      establishments of s per person
--   tasa_com = N(s,e) / NTOT(e)   share of all establishments
-- P(e) and NTOT(e) are summed over eligible AGEBs only, so they are the same
-- denominators the counts in gold.conteo_ageb_scian are drawn from.
-- confiable: N(s,e) >= 30 (§1.4).

DROP TABLE IF EXISTS gold.tasa_scian CASCADE;

CREATE TABLE gold.tasa_scian AS
WITH ent AS (
  -- one row per eligible AGEB, then summed: population and all establishments
  SELECT entidad_id, sum(poblacion)::bigint AS pob_total, sum(n_estab_total_ageb)::bigint AS ntot_total
  FROM (SELECT DISTINCT ageb_key, entidad_id, poblacion, n_estab_total_ageb FROM gold.conteo_ageb_scian) a
  GROUP BY 1
)
SELECT
  c.entidad_id,
  c.nivel_scian,
  c.scian_id,
  sum(c.n_estab)::int                                   AS n_total,
  e.pob_total,
  e.ntot_total,
  sum(c.n_estab)::numeric / e.pob_total                 AS tasa_pob,
  sum(c.n_estab)::numeric / e.ntot_total                AS tasa_com,
  sum(c.n_estab) >= 30                                  AS confiable
FROM gold.conteo_ageb_scian c
JOIN ent e USING (entidad_id)
GROUP BY c.entidad_id, c.nivel_scian, c.scian_id, e.pob_total, e.ntot_total;

ALTER TABLE gold.tasa_scian ADD PRIMARY KEY (entidad_id, nivel_scian, scian_id);
