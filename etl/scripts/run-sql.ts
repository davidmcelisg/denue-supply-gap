// Runs etl/sql/*.sql in filename order. Stops on the first error.
//
//   npm run sql            -> all files
//   npm run sql -- 30_     -> only files whose name starts with "30_"
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const SQL_DIR = path.resolve(import.meta.dirname, "../sql");

async function main() {
  const prefix = process.argv[2] ?? "";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.local)");

  const files = (await readdir(SQL_DIR))
    .filter((f) => f.endsWith(".sql") && f.startsWith(prefix))
    .sort();
  if (files.length === 0) {
    throw new Error(`no .sql files in ${SQL_DIR} matching prefix "${prefix}"`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(SQL_DIR, file), "utf8");
      const t0 = performance.now();
      process.stdout.write(`▶ ${file} ... `);
      try {
        await client.query(sql);
      } catch (err) {
        console.log("FAILED");
        throw err;
      }
      console.log(`ok (${((performance.now() - t0) / 1000).toFixed(2)}s)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
