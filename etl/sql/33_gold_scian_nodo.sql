-- SCIAN nodes at the three grains exposed to the UI, with a search key for
-- the accent-insensitive typeahead. rama/subrama are intentionally absent
-- (PROYECTO.md §1.2).
DROP TABLE IF EXISTS gold.scian_nodo CASCADE;

CREATE TABLE gold.scian_nodo AS
WITH n AS (
  SELECT 'sector'::text AS nivel_scian, id AS scian_id, nombre, NULL::text AS padre_id FROM silver.scian_sector
  UNION ALL
  SELECT 'subsector', id, nombre, sector_id FROM silver.scian_subsector
  UNION ALL
  SELECT 'clase', c.id, c.nombre, r.subsector_id
  FROM silver.scian_clase c
  JOIN silver.scian_subrama sr ON sr.id = c.subrama_id
  JOIN silver.scian_rama r ON r.id = sr.rama_id
)
SELECT nivel_scian, scian_id, nombre, padre_id,
       scian_id || ' ' || lower(unaccent(nombre)) AS busqueda
FROM n;

ALTER TABLE gold.scian_nodo ADD PRIMARY KEY (nivel_scian, scian_id);
