-- Geography. ageb_key = entidad(2) + municipio(3) + localidad(4) + ageb(4),
-- built from the Censo's already zero-padded code columns. DENUE carries the
-- same four parts with the same widths (verified in T2.3), so the key is built
-- identically on both sides with plain concatenation.
--
-- Only urban AGEB-total rows of the Censo are used (MZA = '000', AGEB <> '0000').
-- Municipio names come from the Censo; entidad names from DENUE.
DROP TABLE IF EXISTS silver.ageb, silver.municipio, silver.entidad CASCADE;

CREATE TABLE silver.entidad (
  id     char(2) PRIMARY KEY,
  nombre text NOT NULL
);
INSERT INTO silver.entidad
SELECT cve_ent, min(btrim(entidad)) FROM bronze.denue_raw GROUP BY cve_ent;

CREATE TABLE silver.municipio (
  id         char(5) PRIMARY KEY,           -- entidad + municipio
  entidad_id char(2) NOT NULL REFERENCES silver.entidad(id),
  nombre     text NOT NULL
);
INSERT INTO silver.municipio
SELECT "ENTIDAD" || "MUN", "ENTIDAD", btrim("NOM_MUN")
FROM bronze.censo_ageb_raw
WHERE "MUN" <> '000' AND "LOC" = '0000';   -- municipio-total rows

CREATE TABLE silver.ageb (
  ageb_key     char(13) PRIMARY KEY,
  entidad_id   char(2)  NOT NULL REFERENCES silver.entidad(id),
  municipio_id char(5)  NOT NULL REFERENCES silver.municipio(id),
  localidad_id char(4)  NOT NULL,
  poblacion    int      NOT NULL,
  es_elegible  boolean  NOT NULL
);
INSERT INTO silver.ageb
SELECT "ENTIDAD" || "MUN" || "LOC" || "AGEB",
       "ENTIDAD",
       "ENTIDAD" || "MUN",
       "LOC",
       "POBTOT"::int,
       "POBTOT"::int >= 500
FROM bronze.censo_ageb_raw
WHERE "MZA" = '000' AND "AGEB" <> '0000';

CREATE INDEX ON silver.ageb (entidad_id, es_elegible);
