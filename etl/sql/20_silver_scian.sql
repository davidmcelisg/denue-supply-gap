-- SCIAN 2023 hierarchy. Ids are the code prefixes (clase 6 digits, subrama 5,
-- rama 4, subsector 3, sector 2). Sectors 31-33 and 48-49 are grouped ranges
-- in SCIAN and are stored as single sectors with id '31-33' / '48-49'.
-- Names come from the official catalog (bronze.scian_raw) with the trailing
-- "T" comparability marker stripped; clases missing from the catalog fall back
-- to DENUE's own class text.

DROP TABLE IF EXISTS silver.scian_clase, silver.scian_subrama, silver.scian_rama,
                     silver.scian_subsector, silver.scian_sector CASCADE;

CREATE OR REPLACE FUNCTION silver.scian_sector_id(prefix2 text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN prefix2 IN ('31','32','33') THEN '31-33'
    WHEN prefix2 IN ('48','49')      THEN '48-49'
    ELSE prefix2 END
$$;

CREATE OR REPLACE FUNCTION silver.scian_clean_nombre(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  -- marker is an uppercase T glued to the end of a lowercase word or ')'
  SELECT btrim(regexp_replace(raw, '(?<=[[:lower:]\)])T\s*$', ''))
$$;

CREATE TEMP TABLE cat AS
SELECT codigo, silver.scian_clean_nombre(nombre_es) AS nombre
FROM bronze.scian_raw;

CREATE TABLE silver.scian_sector (
  id     text PRIMARY KEY,
  nombre text NOT NULL
);
INSERT INTO silver.scian_sector
SELECT codigo, nombre FROM cat WHERE length(codigo) = 2 OR codigo ~ '^\d{2}-\d{2}$';

CREATE TABLE silver.scian_subsector (
  id        text PRIMARY KEY,
  sector_id text NOT NULL REFERENCES silver.scian_sector(id),
  nombre    text NOT NULL
);
INSERT INTO silver.scian_subsector
SELECT codigo, silver.scian_sector_id(left(codigo, 2)), nombre FROM cat WHERE codigo ~ '^\d{3}$';

CREATE TABLE silver.scian_rama (
  id           text PRIMARY KEY,
  subsector_id text NOT NULL REFERENCES silver.scian_subsector(id),
  nombre       text NOT NULL
);
INSERT INTO silver.scian_rama
SELECT codigo, left(codigo, 3), nombre FROM cat WHERE codigo ~ '^\d{4}$';

CREATE TABLE silver.scian_subrama (
  id      text PRIMARY KEY,
  rama_id text NOT NULL REFERENCES silver.scian_rama(id),
  nombre  text NOT NULL
);
INSERT INTO silver.scian_subrama
SELECT codigo, left(codigo, 4), nombre FROM cat WHERE codigo ~ '^\d{5}$';

CREATE TABLE silver.scian_clase (
  id         text PRIMARY KEY,
  subrama_id text NOT NULL REFERENCES silver.scian_subrama(id),
  nombre     text NOT NULL
);
-- catalog clases, plus any DENUE clase absent from the catalog (name from DENUE)
INSERT INTO silver.scian_clase
SELECT codigo, left(codigo, 5), nombre FROM cat WHERE codigo ~ '^\d{6}$'
UNION ALL
SELECT d.codigo_act, left(d.codigo_act, 5), min(d.nombre_act)
FROM bronze.denue_raw d
WHERE NOT EXISTS (SELECT 1 FROM cat WHERE cat.codigo = d.codigo_act)
GROUP BY d.codigo_act;

DROP TABLE cat;
