-- Estrato de personal ocupado. DENUE ships it as display text
-- ("6 a 10 personas"); the numeric bounds are parsed from that text.
-- Bounds are a bucket, never a headcount (PROYECTO.md §1.5.4).
DROP TABLE IF EXISTS silver.estrato CASCADE;

CREATE TABLE silver.estrato (
  id           smallint PRIMARY KEY,
  etiqueta     text NOT NULL UNIQUE,
  personal_min int  NOT NULL,
  personal_max int           -- NULL = open-ended ("251 y más")
);

INSERT INTO silver.estrato (id, etiqueta, personal_min, personal_max)
SELECT row_number() OVER (ORDER BY personal_min),
       etiqueta, personal_min, personal_max
FROM (
  SELECT DISTINCT
    per_ocu AS etiqueta,
    (regexp_match(per_ocu, '^(\d+)'))[1]::int AS personal_min,
    (regexp_match(per_ocu, '^\d+ a (\d+)'))[1]::int AS personal_max
  FROM bronze.denue_raw
) x;
