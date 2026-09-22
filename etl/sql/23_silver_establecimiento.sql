-- One row per DENUE establishment. Cleaning rules are exactly PROYECTO.md T2.4.
-- Rows are never deleted for quality reasons; problems go in calidad_flags.
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP TABLE IF EXISTS silver.establecimiento CASCADE;
DROP TABLE IF EXISTS silver.entidad_bbox;

-- Generous bounding boxes per entidad for the coord_sospechosa flag.
CREATE TABLE silver.entidad_bbox (
  entidad_id char(2) PRIMARY KEY REFERENCES silver.entidad(id),
  lat_min numeric, lat_max numeric, lon_min numeric, lon_max numeric
);
INSERT INTO silver.entidad_bbox VALUES
  ('09', 19.00, 19.70,  -99.45, -98.85),
  ('19', 23.10, 27.90, -101.30, -98.30);

-- Rule 1: uppercase, strip accents, collapse whitespace, strip trailing legal
-- suffixes (S.A. DE C.V., SA DE CV, S. DE R.L., S.C., S.A.P.I., with or
-- without dots/spaces). Suffix must be preceded by whitespace so glued
-- forms like "PEDROSA DECV" are left alone rather than mangled.
CREATE OR REPLACE FUNCTION silver.norm_nombre(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(upper(unaccent(coalesce(raw, ''))), '\s+', ' ', 'g'),
    '\s+(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?|S\.?\s?C\.?|S\.?\s?DE\s?R\.?\s?L\.?)(\s?DE\s?C\.?\s?V\.?)?\.?\s*$',
    ''))
$$;

CREATE TABLE silver.establecimiento AS
SELECT
  d.clee,
  d.id                                   AS id_establecimiento,
  btrim(d.nom_estab)                     AS nombre,
  silver.norm_nombre(d.nom_estab)        AS nombre_norm,
  btrim(d.raz_social)                    AS razon_social,
  silver.norm_nombre(d.raz_social)       AS razon_social_norm,
  d.codigo_act                           AS clase_id,
  e.id                                   AS estrato_id,
  a.ageb_key,
  (d.cve_ent || d.cve_mun)::char(5)      AS municipio_id,
  d.latitud::numeric(11,8)               AS lat,
  d.longitud::numeric(11,8)              AS lon,
  -- Rule 5: '' counts as empty (PROYECTO.md §3)
  (btrim(d.telefono) <> '' OR btrim(d.correoelec) <> '' OR btrim(d.www) <> '') AS tiene_contacto,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN a.ageb_key IS NULL THEN 'sin_ageb' END,
    -- Rule 3
    CASE WHEN d.latitud::numeric NOT BETWEEN b.lat_min AND b.lat_max
           OR d.longitud::numeric NOT BETWEEN b.lon_min AND b.lon_max THEN 'coord_sospechosa' END,
    -- Rule 4
    CASE WHEN left(d.clee, 2) <> d.cve_ent
           OR substr(d.clee, 3, 3) <> d.cve_mun
           OR substr(d.clee, 6, 6) <> d.codigo_act THEN 'clee_inconsistente' END
  ], NULL)::text[]                       AS calidad_flags
FROM bronze.denue_raw d
JOIN silver.estrato e ON e.etiqueta = d.per_ocu
JOIN silver.entidad_bbox b ON b.entidad_id = d.cve_ent
LEFT JOIN silver.ageb a ON a.ageb_key = d.cve_ent || d.cve_mun || d.cve_loc || d.ageb;

-- Rule 2: CLEE is the true key. Bronze has no duplicate CLEEs (checked in
-- T2.4); the PK guarantees the property going forward.
ALTER TABLE silver.establecimiento
  ADD PRIMARY KEY (clee),
  ALTER COLUMN clase_id     SET NOT NULL,
  ALTER COLUMN estrato_id   SET NOT NULL,
  ALTER COLUMN municipio_id SET NOT NULL,
  ADD FOREIGN KEY (clase_id)     REFERENCES silver.scian_clase(id),
  ADD FOREIGN KEY (estrato_id)   REFERENCES silver.estrato(id),
  ADD FOREIGN KEY (municipio_id) REFERENCES silver.municipio(id),
  ADD FOREIGN KEY (ageb_key)     REFERENCES silver.ageb(ageb_key);

-- Rule 2 (near-duplicates): same nombre_norm within ~50 m -> posible_duplicado,
-- never merged. Pairs are found by bucketing into ~55 m grid cells and
-- comparing neighbouring cells, then filtering with an equirectangular
-- distance (accurate enough at 50 m). Empty / very short names are skipped,
-- as are DENUE's "<actividad> SIN NOMBRE" placeholders for unnamed businesses:
-- two unnamed fruit stands 30 m apart are not duplicates of each other.
CREATE TEMP TABLE grid AS
SELECT clee, nombre_norm,
       floor(lat / 0.0005)::int AS cy,
       floor(lon / 0.0005)::int AS cx,
       lat, lon
FROM silver.establecimiento
WHERE length(nombre_norm) >= 4
  AND nombre_norm NOT LIKE '%SIN NOMBRE%'
  AND NOT ('coord_sospechosa' = ANY(calidad_flags));
CREATE INDEX ON grid (nombre_norm, cy, cx);

CREATE TEMP TABLE near_dups AS
SELECT DISTINCT p.clee
FROM grid p
JOIN grid q
  ON q.nombre_norm = p.nombre_norm
 AND q.cy BETWEEN p.cy - 1 AND p.cy + 1
 AND q.cx BETWEEN p.cx - 1 AND p.cx + 1
 AND q.clee <> p.clee
WHERE sqrt(power((q.lat - p.lat) * 111320, 2)
         + power((q.lon - p.lon) * 111320 * cos(radians(p.lat)), 2)) <= 50;

UPDATE silver.establecimiento s
SET calidad_flags = array_append(calidad_flags, 'posible_duplicado')
FROM near_dups n WHERE n.clee = s.clee;

DROP TABLE grid, near_dups;

CREATE INDEX ON silver.establecimiento (ageb_key);
CREATE INDEX ON silver.establecimiento (clase_id);
CREATE INDEX ON silver.establecimiento (municipio_id);
CREATE INDEX ON silver.establecimiento USING gin (calidad_flags);
