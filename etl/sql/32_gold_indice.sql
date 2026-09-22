-- Supply index per (eligible AGEB × SCIAN node), PROYECTO.md §1.
--   esperado_pob = pob(a) * tasa_pob(s,e)
--   esperado_com = ntot(a) * tasa_com(s,e)
--   indice       = (n + α) / (esperado + α)        α from gold.config
--   banda        = fixed thresholds on the index (§1.3)
--   percentil    = percent_rank() within (entidad, nivel, scian)
-- An index is only valid at the grain it was computed at (§1.2).

DROP TABLE IF EXISTS gold.indice_suministro CASCADE;
DROP TABLE IF EXISTS gold.config CASCADE;

-- Single config location (§1.1). Read by the web app's `contexto` too.
CREATE TABLE gold.config (
  clave text PRIMARY KEY,
  valor text NOT NULL
);
INSERT INTO gold.config VALUES
  ('alpha',         '1'),
  ('edicion_denue', '2026-05'),
  ('anio_censo',    '2020'),
  ('min_confiable', '30'),
  ('min_poblacion', '500');

CREATE OR REPLACE FUNCTION gold.banda(indice numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN indice < 0.5  THEN 'muy_bajo'
    WHEN indice < 0.8  THEN 'bajo'
    WHEN indice < 1.25 THEN 'normal'
    WHEN indice < 2.0  THEN 'alto'
    ELSE                    'muy_alto' END
$$;

CREATE TABLE gold.indice_suministro AS
WITH cfg AS (SELECT valor::numeric AS alpha FROM gold.config WHERE clave = 'alpha'),
base AS (
  SELECT
    c.ageb_key, c.entidad_id, c.nivel_scian, c.scian_id,
    c.n_estab, c.poblacion, c.n_estab_total_ageb,
    (c.poblacion * t.tasa_pob)::numeric(12,4)          AS esperado_pob,
    (c.n_estab_total_ageb * t.tasa_com)::numeric(12,4) AS esperado_com,
    ((c.n_estab + cfg.alpha) / (c.poblacion * t.tasa_pob + cfg.alpha))::numeric(10,4)          AS indice_pob,
    ((c.n_estab + cfg.alpha) / (c.n_estab_total_ageb * t.tasa_com + cfg.alpha))::numeric(10,4) AS indice_comercial,
    t.confiable
  FROM gold.conteo_ageb_scian c
  JOIN gold.tasa_scian t USING (entidad_id, nivel_scian, scian_id)
  CROSS JOIN cfg
)
SELECT
  ageb_key, entidad_id, nivel_scian, scian_id,
  n_estab, poblacion, n_estab_total_ageb,
  esperado_pob, esperado_com,
  indice_pob, indice_comercial,
  percent_rank() OVER (PARTITION BY entidad_id, nivel_scian, scian_id ORDER BY indice_pob)::numeric(6,4)       AS percentil_pob,
  percent_rank() OVER (PARTITION BY entidad_id, nivel_scian, scian_id ORDER BY indice_comercial)::numeric(6,4) AS percentil_com,
  gold.banda(indice_pob)       AS banda_pob,
  gold.banda(indice_comercial) AS banda_com,
  confiable
FROM base;

ALTER TABLE gold.indice_suministro ADD PRIMARY KEY (nivel_scian, scian_id, ageb_key);
CREATE INDEX ON gold.indice_suministro (nivel_scian, scian_id, entidad_id, indice_pob);
CREATE INDEX ON gold.indice_suministro (nivel_scian, scian_id, entidad_id, indice_comercial);
CREATE INDEX ON gold.indice_suministro (ageb_key);
ANALYZE gold.indice_suministro;
