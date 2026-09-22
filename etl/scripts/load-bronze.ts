// Loads raw CSVs into bronze with server-side COPY. The raw directory is
// mounted read-only in the Postgres container at /raw (docker-compose.yml).
// Encodings come from etl/scripts/inspect.ts: DENUE is Latin-1, Censo is UTF-8.
//
//   npm run load:bronze
import pg from "pg";

const DENUE_EDICION = "2026-05";
const CENSO_ANIO = 2020;

const SOURCES = [
  { table: "bronze.denue_raw", meta: { source_file: "denue_inegi_09_.csv", edicion: DENUE_EDICION }, path: "/raw/denue/09/conjunto_de_datos/denue_inegi_09_.csv", encoding: "LATIN1" },
  { table: "bronze.denue_raw", meta: { source_file: "denue_inegi_19_.csv", edicion: DENUE_EDICION }, path: "/raw/denue/19/conjunto_de_datos/denue_inegi_19_.csv", encoding: "LATIN1" },
  { table: "bronze.censo_ageb_raw", meta: { source_file: "conjunto_de_datos_ageb_urbana_09_cpv2020.csv", anio: CENSO_ANIO }, path: "/raw/censo/09/ageb_mza_urbana_09_cpv2020/conjunto_de_datos/conjunto_de_datos_ageb_urbana_09_cpv2020.csv", encoding: "UTF8" },
  { table: "bronze.censo_ageb_raw", meta: { source_file: "conjunto_de_datos_ageb_urbana_19_cpv2020.csv", anio: CENSO_ANIO }, path: "/raw/censo/19/ageb_mza_urbana_19_cpv2020/conjunto_de_datos/conjunto_de_datos_ageb_urbana_19_cpv2020.csv", encoding: "UTF8" },
] as const;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const s of SOURCES) {
      const [schema, table] = s.table.split(".");
      const { rows: colRows } = await client.query(
        `select column_name from information_schema.columns
         where table_schema = $1 and table_name = $2
           and column_name not in ('source_file','edicion','anio','ingested_at')
         order by ordinal_position`,
        [schema, table],
      );
      const cols = colRows.map((r) => `"${r.column_name}"`).join(", ");
      const metaCols = Object.keys(s.meta);
      const metaVals = Object.values(s.meta);

      const t0 = performance.now();
      process.stdout.write(`▶ ${s.table} ← ${s.path.split("/").pop()} ... `);
      await client.query("BEGIN");
      // Replace this source_file only — the other entidad may be loaded separately.
      await client.query(`DELETE FROM ${s.table} WHERE source_file = $1`, [s.meta.source_file]);
      // Rows land with NULL metadata, then get stamped before commit so a
      // failed COPY never leaves half-labelled rows behind.
      await client.query(`ALTER TABLE ${s.table} ALTER COLUMN ${metaCols.map((c) => `"${c}" DROP NOT NULL`).join(", ALTER COLUMN ")}`);
      // FORCE_NULL is deliberately NOT used: '' stays '' (see PROYECTO.md §3).
      const copy = await client.query(
        `COPY ${s.table} (${cols}) FROM '${s.path}' WITH (FORMAT csv, HEADER true, ENCODING '${s.encoding}', NULL '\\N')`,
      );
      await client.query(
        `UPDATE ${s.table} SET ${metaCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ")} WHERE source_file IS NULL`,
        metaVals,
      );
      await client.query(`ALTER TABLE ${s.table} ALTER COLUMN ${metaCols.map((c) => `"${c}" SET NOT NULL`).join(", ALTER COLUMN ")}`);
      await client.query("COMMIT");
      console.log(`${copy.rowCount?.toLocaleString()} rows (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    }

    console.log("\nrow counts per source_file:");
    for (const t of ["bronze.denue_raw", "bronze.censo_ageb_raw"]) {
      const { rows } = await client.query(`select source_file, count(*)::int as n from ${t} group by 1 order by 1`);
      for (const r of rows) console.log(`  ${t.padEnd(24)} ${r.source_file.padEnd(48)} ${r.n.toLocaleString().padStart(10)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
