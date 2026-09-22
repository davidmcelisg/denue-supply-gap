// Loads the official SCIAN 2023 structure workbook into bronze.scian_raw.
// Source: https://www.inegi.org.mx/contenidos/app/scian/estructura2023.xlsx
//
//   npm run load:scian
import path from "node:path";
import XLSX from "xlsx";
import pg from "pg";

const FILE = path.resolve(import.meta.dirname, "../data/raw/scian/estructura2023.xlsx");

async function main() {
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Español-Inglés"], { header: 1 })
    .slice(1) // title row
    .filter((r) => r[0] != null && r[1] != null)
    .map((r) => [String(r[0]).trim(), String(r[1]), r[2] == null ? null : String(r[3] ?? "")]);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM bronze.scian_raw");
    for (const [codigo, es, en] of rows) {
      await client.query(
        "INSERT INTO bronze.scian_raw (codigo, nombre_es, nombre_en, source_file) VALUES ($1,$2,$3,$4)",
        [codigo, es, en, "estructura2023.xlsx"],
      );
    }
    await client.query("COMMIT");
    const { rows: c } = await client.query(
      `select case when codigo ~ '^\\d+$' then length(codigo)::text else 'range' end as k, count(*)::int n
       from bronze.scian_raw group by 1 order by 1`,
    );
    console.log(`bronze.scian_raw: ${rows.length} rows`, Object.fromEntries(c.map((r) => [r.k, r.n])));
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
