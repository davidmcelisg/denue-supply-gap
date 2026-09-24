-- Everyday names for the typeahead. Official SCIAN labels are formal
-- ("Centros de acondicionamiento físico"), so a few dozen Spanish synonyms
-- are seeded here. No LLM, no external API — just this table.
-- Codes that were wrong in the original list (541940, 461120, 461212-as-vinatería)
-- are mapped to the nodes that actually exist in gold.scian_nodo.
DROP TABLE IF EXISTS gold.scian_sinonimo CASCADE;

CREATE TABLE gold.scian_sinonimo (
  nivel_scian text NOT NULL,
  scian_id    text NOT NULL,
  sinonimo    text NOT NULL,
  PRIMARY KEY (nivel_scian, scian_id, sinonimo)
);

INSERT INTO gold.scian_sinonimo (nivel_scian, scian_id, sinonimo) VALUES
  ('clase', '713943', 'gimnasio'),
  ('clase', '713943', 'gym'),
  ('clase', '713943', 'fitness'),
  ('clase', '713944', 'gimnasio'),
  ('clase', '722514', 'taquería'),
  ('clase', '722514', 'tacos'),
  ('clase', '722514', 'tortas'),
  ('clase', '722515', 'café'),
  ('clase', '722515', 'cafetería'),
  ('clase', '722515', 'nevería'),
  ('clase', '468411', 'gasolinera'),
  ('clase', '468411', 'gasolina'),
  ('clase', '541941', 'veterinaria'),
  ('clase', '541942', 'veterinaria'),
  ('clase', '812110', 'estética'),
  ('clase', '812110', 'salón de belleza'),
  ('clase', '812110', 'peluquería'),
  ('clase', '812210', 'lavandería'),
  ('clase', '812210', 'tintorería'),
  ('clase', '465311', 'papelería'),
  ('clase', '467111', 'ferretería'),
  ('clase', '467111', 'tlapalería'),
  ('clase', '611121', 'escuela primaria'),
  ('clase', '611121', 'primaria'),
  ('clase', '611122', 'escuela primaria'),
  ('clase', '621111', 'consultorio'),
  ('clase', '621111', 'doctor'),
  ('clase', '621511', 'consultorio'),
  ('clase', '621511', 'laboratorio'),
  ('clase', '722511', 'restaurante'),
  ('clase', '722412', 'bar'),
  ('clase', '722412', 'cantina'),
  ('clase', '721111', 'hotel'),
  ('clase', '311830', 'tortillería'),
  ('clase', '311812', 'panadería'),
  ('clase', '461121', 'carnicería'),
  ('clase', '461211', 'vinatería'),
  ('clase', '461211', 'licores'),
  ('clase', '461110', 'tiendita'),
  ('clase', '461110', 'miscelánea'),
  -- 'minisúper' belongs to 462112, not to the corner store: seeding it on
  -- 461110 ranked the wrong clase above the one actually named that way.
  ('clase', '462112', 'minisúper'),
  ('clase', '462112', 'minisuper'),
  ('clase', '462112', 'autoservicio');

DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM gold.scian_sinonimo s
  WHERE NOT EXISTS (
    SELECT 1 FROM gold.scian_nodo n
    WHERE n.nivel_scian = s.nivel_scian AND n.scian_id = s.scian_id
  );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'gold.scian_sinonimo: % rows missing from gold.scian_nodo', v_missing;
  END IF;
END $$;
