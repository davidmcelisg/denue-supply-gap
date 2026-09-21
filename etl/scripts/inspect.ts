// Inspects raw files before any loader runs: encoding, delimiter, columns,
// first rows, and per-column null/empty counts over the first N rows.
//
//   npm run inspect
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";

const RAW = path.resolve(import.meta.dirname, "../data/raw");
const SAMPLE_ROWS = 10_000;

const FILES = [
  "denue/09/conjunto_de_datos/denue_inegi_09_.csv",
  "denue/19/conjunto_de_datos/denue_inegi_19_.csv",
  "censo/09/ageb_mza_urbana_09_cpv2020/conjunto_de_datos/conjunto_de_datos_ageb_urbana_09_cpv2020.csv",
  "censo/19/ageb_mza_urbana_19_cpv2020/conjunto_de_datos/conjunto_de_datos_ageb_urbana_19_cpv2020.csv",
];

type Encoding = "utf8" | "latin1";

// Reads the first 1 MB and decides: BOM -> utf8; valid UTF-8 with multibyte
// sequences -> utf8; otherwise latin1. Also reports the accent canary.
async function detectEncoding(file: string) {
  const fh = await open(file, "r");
  const buf = Buffer.alloc(1 << 20);
  const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
  await fh.close();
  const head = buf.subarray(0, bytesRead);
  const bom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
  const asUtf8 = head.toString("utf8");
  const validUtf8 = !asUtf8.includes("�");
  const hasHighBytes = head.some((b) => b >= 0x80);
  const encoding: Encoding = bom || (validUtf8 && hasHighBytes) ? "utf8" : "latin1";
  const decoded = head.toString(encoding);
  const canary = decoded.match(/CUAUHT.{1,2}MOC|Cuauht.{1,2}moc|M.{1,2}xico/)?.[0] ?? "(no canary found)";
  return { encoding, bom, canary };
}

function detectDelimiter(line: string) {
  const c = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of line) if (ch in c) c[ch as keyof typeof c]++;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

async function inspect(rel: string) {
  const file = path.join(RAW, rel);
  console.log(`\n${"=".repeat(100)}\n${rel}\n${"=".repeat(100)}`);

  const { encoding, bom, canary } = await detectEncoding(file);
  console.log(`encoding: ${encoding}${bom ? " (with BOM)" : ""}   canary: ${canary}`);

  const fh = await open(file, "r");
  const first = Buffer.alloc(8192);
  await fh.read(first, 0, first.length, 0);
  await fh.close();
  const firstLine = first.toString(encoding).split(/\r?\n/)[0];
  const delimiter = detectDelimiter(firstLine);
  console.log(`delimiter: ${JSON.stringify(delimiter)}`);

  const parser = createReadStream(file, { encoding }).pipe(
    parse({ delimiter, bom: true, relax_column_count: true, relax_quotes: true, trim: false }),
  );

  let header: string[] = [];
  let n = 0;
  let total = 0;
  const nulls: number[] = [];
  const empties: number[] = [];
  const blanks: number[] = []; // whitespace-only
  const sample: string[][] = [];
  let widthMismatch = 0;

  for await (const row of parser as AsyncIterable<string[]>) {
    if (header.length === 0) {
      header = row;
      nulls.length = empties.length = blanks.length = header.length;
      nulls.fill(0); empties.fill(0); blanks.fill(0);
      continue;
    }
    total++;
    if (row.length !== header.length) widthMismatch++;
    if (n >= SAMPLE_ROWS) continue;
    n++;
    if (sample.length < 5) sample.push(row);
    for (let i = 0; i < header.length; i++) {
      const v = row[i];
      if (v === undefined || v === null) nulls[i]++;
      else if (v === "") empties[i]++;
      else if (v.trim() === "") blanks[i]++;
    }
  }

  console.log(`columns (${header.length}): ${header.join(", ")}`);
  console.log(`total data rows (parsed): ${total.toLocaleString()}   rows with column-count mismatch: ${widthMismatch}`);
  console.log(`\nfirst 5 rows:`);
  for (const r of sample) console.log("  " + r.map((v) => JSON.stringify(v)).join(" | "));

  console.log(`\nper-column counts over first ${n.toLocaleString()} rows  (missing / empty "" / whitespace-only):`);
  const w = Math.max(...header.map((h) => h.length));
  for (let i = 0; i < header.length; i++) {
    const flag = nulls[i] + empties[i] + blanks[i] > 0 ? "" : "   ok";
    console.log(`  ${header[i].padEnd(w)}  ${String(nulls[i]).padStart(6)}  ${String(empties[i]).padStart(6)}  ${String(blanks[i]).padStart(6)}${flag}`);
  }
}

for (const f of FILES) await inspect(f);
