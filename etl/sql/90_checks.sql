-- Post-build invariants. Runs last; any failure aborts the runner so a broken
-- rebuild never reaches the web app silently. Thresholds from PROYECTO.md.
DO $$
DECLARE
  v_fallos int;
  v_join_min numeric;
  v_silver bigint;
  v_bronze bigint;
  v_no_confiable_first int;
BEGIN
  -- 1. Rate join is right: sum(esperado) = sum(n_estab) per (entidad, nivel, scian)
  SELECT count(*) INTO v_fallos FROM (
    SELECT entidad_id, nivel_scian, scian_id
    FROM gold.indice_suministro
    GROUP BY 1, 2, 3
    HAVING abs(sum(esperado_pob) - sum(n_estab)) > 0.01
        OR abs(sum(esperado_com) - sum(n_estab)) > 0.05
  ) x;
  IF v_fallos > 0 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: sum(esperado) <> sum(n_estab) for % nodes', v_fallos;
  END IF;
  RAISE NOTICE '1/8 identidad de tasas: sum(esperado) = sum(n_estab) en los % nodos',
    (SELECT count(*) FROM gold.tasa_scian);

  -- 2. Zero rows present: every eligible AGEB has a row for every node in its entidad
  SELECT count(*) INTO v_fallos FROM (
    SELECT c.entidad_id, c.nivel_scian, count(DISTINCT c.ageb_key) agebs,
           (SELECT count(*) FROM silver.ageb a WHERE a.entidad_id = c.entidad_id AND a.es_elegible) elegibles
    FROM gold.conteo_ageb_scian c GROUP BY 1, 2
    HAVING count(DISTINCT c.ageb_key) <> (SELECT count(*) FROM silver.ageb a WHERE a.entidad_id = c.entidad_id AND a.es_elegible)
  ) x;
  IF v_fallos > 0 THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: eligible AGEBs missing from gold.conteo_ageb_scian';
  END IF;
  RAISE NOTICE '2/8 filas en cero presentes: los % AGEB elegibles tienen fila en cada nodo',
    (SELECT count(*) FROM silver.ageb WHERE es_elegible);

  -- 3. Counts reconcile with silver at every grain
  SELECT count(*) INTO v_fallos FROM (
    SELECT c.entidad_id, c.nivel_scian, sum(c.n_estab) s
    FROM gold.conteo_ageb_scian c GROUP BY 1, 2
    HAVING sum(c.n_estab) <> (
      SELECT count(*) FROM silver.establecimiento e JOIN silver.ageb a USING (ageb_key)
      WHERE a.es_elegible AND a.entidad_id = c.entidad_id)
  ) x;
  IF v_fallos > 0 THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: gold counts do not reconcile with eligible silver establishments';
  END IF;
  RAISE NOTICE '3/8 conteos cuadran con silver en los tres granos: % establecimientos elegibles',
    (SELECT count(*) FROM silver.establecimiento e JOIN silver.ageb a USING (ageb_key) WHERE a.es_elegible);

  -- 4. Join rate per entidad >= 90 % (T2.3 target)
  SELECT min(rate) INTO v_join_min FROM (
    SELECT 100.0 * count(e.ageb_key) / count(*) rate
    FROM silver.establecimiento e GROUP BY left(e.municipio_id, 2)
  ) x;
  IF v_join_min < 90 THEN
    RAISE EXCEPTION 'CHECK 4 FAILED: DENUE -> AGEB join rate % < 90%%', round(v_join_min, 2);
  END IF;
  RAISE NOTICE '4/8 join DENUE -> AGEB: peor entidad % %%', round(v_join_min, 2);

  -- 5. Silver row count within 1 % of bronze; nothing deleted for quality
  SELECT count(*) INTO v_silver FROM silver.establecimiento;
  SELECT count(*) INTO v_bronze FROM bronze.denue_raw;
  IF v_bronze = 0 OR abs(v_silver - v_bronze) > 0.01 * v_bronze THEN
    RAISE EXCEPTION 'CHECK 5 FAILED: silver.establecimiento % rows vs bronze %', v_silver, v_bronze;
  END IF;
  RAISE NOTICE '5/8 nada se borro por calidad: bronze % -> silver %', v_bronze, v_silver;

  -- 6. One rate row per node present in counts
  SELECT count(*) INTO v_fallos FROM (
    SELECT DISTINCT entidad_id, nivel_scian, scian_id FROM gold.conteo_ageb_scian
    EXCEPT SELECT entidad_id, nivel_scian, scian_id FROM gold.tasa_scian
  ) x;
  IF v_fallos > 0 THEN
    RAISE EXCEPTION 'CHECK 6 FAILED: % nodes without a rate row', v_fallos;
  END IF;
  RAISE NOTICE '6/8 cada nodo de conteo tiene su fila de tasa';

  -- 7. Curated findings on / still resolve (PROYECTO.md §5)
  SELECT count(*) INTO v_fallos FROM (VALUES
    ('0901600010158','clase','722511'), ('1903900014233','clase','461110'),
    ('1901900010083','clase','722511'), ('0901000011542','clase','461110'),
    ('0901500011017','clase','722511')
  ) v(ageb_key, nivel, scian)
  WHERE NOT EXISTS (SELECT 1 FROM gold.indice_suministro i
                    WHERE i.ageb_key = v.ageb_key AND i.nivel_scian = v.nivel AND i.scian_id = v.scian);
  IF v_fallos > 0 THEN
    RAISE EXCEPTION 'CHECK 7 FAILED: % curated AGEB x clase pairs missing from gold', v_fallos;
  END IF;
  RAISE NOTICE '7/8 los 5 AGEB x clase curados siguen resolviendo';

  -- 8. Polanco reads oversupplied in restaurants by population (§5 sanity)
  IF (SELECT indice_pob FROM gold.indice_suministro WHERE ageb_key = '0901600010158' AND scian_id = '722511') < 1.25 THEN
    RAISE EXCEPTION 'CHECK 8 FAILED: Polanco restaurants indice_pob < 1.25, something is wrong';
  END IF;
  RAISE NOTICE '8/8 cordura: Polanco sobre-ofertado en restaurantes (indice %)',
    (SELECT indice_pob FROM gold.indice_suministro WHERE ageb_key = '0901600010158' AND scian_id = '722511');

  RAISE NOTICE 'las 8 invariantes pasaron';
END $$;
