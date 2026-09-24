// Runs etl/sql/*.sql in filename order. Stops on the first error.
//
//   npm run sql            -> all files
//   npm run sql -- 30_     -> only files whose name starts with "30_"
//
// A prefix run always appends 90_checks.sql: a partial rebuild that skipped
// the invariants would be exactly the rebuild most likely to be broken.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const SQL_DIR = path.resolve(import.meta.dirname, "../sql");

async function main() {
  const prefix = process.argv[2] ?? "";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.local)");

  const all = (await readdir(SQL_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const matched = all.filter((f) => f.startsWith(prefix));
  if (matched.length === 0) {
    throw new Error(`no .sql files in ${SQL_DIR} matching prefix "${prefix}"`);
  }
  const checks = all.filter((f) => f.startsWith("90_"));
  const files = matched.some((f) => f.startsWith("90_")) ? matched : [...matched, ...checks];

  const client = new pg.Client({ connectionString: url });
  // 90_checks.sql reports through RAISE NOTICE; without this the run prints
  // "ok" and says nothing about which invariants were verified. Buffered so
  // the message lands under its file's line, not inside it.
  // Postgres emits its own DDL chatter as notices ("already exists, skipping",
  // "drop cascades to ..."). Those are expected on every rebuild and would bury
  // what 90_checks.sql reports, so only deliberate RAISE NOTICE output is kept.
  const RUIDO_DDL = /already exists, skipping|does not exist, skipping|drop cascades to|will create implicit/i;
  let notices: string[] = [];
  client.on("notice", (n) => {
    if (n.message && !RUIDO_DDL.test(n.message)) notices.push(n.message);
  });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(SQL_DIR, file), "utf8");
      const t0 = performance.now();
      notices = [];
      process.stdout.write(`▶ ${file} ... `);
      try {
        await client.query(sql);
      } catch (err) {
        console.log("FAILED");
        throw err;
      }
      console.log(`ok (${((performance.now() - t0) / 1000).toFixed(2)}s)`);
      for (const m of notices) console.log(`    ${m}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
