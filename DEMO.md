# DEMO.md — run the whole thing end to end

Everything below runs from the repo root unless noted. Total cold time on a
laptop: ~5 min (downloads ~90 MB, ETL ~2 min, web build ~1 min).

## 0. Prerequisites (once)

- Docker Desktop running (`open -a Docker`)
- Node 22+ and npm
- `.env.local` at the repo root:

```bash
cp .env.local.example .env.local
```

then paste your INEGI token after `INEGI_TOKEN=`. `DATABASE_URL` is already
filled in and matches `docker-compose.yml`. (The token is not needed by the
pipeline — the bulk files are public — but keep it there for the API scripts.)

```bash
npm install
```

## 1. Start Postgres

```bash
docker compose up -d
```

Wait for `healthy`:

```bash
docker compose ps
```

## 2. Download raw data (once, ~90 MB)

All three sources are public INEGI files. They land in `etl/data/raw/`
(gitignored).

```bash
mkdir -p etl/data/raw/denue etl/data/raw/censo etl/data/raw/scian
```

DENUE 05/2026, entidades 09 (CDMX) and 19 (NL):

```bash
for e in 09 19; do curl -sL -A "Mozilla/5.0" -o etl/data/raw/denue/denue_${e}_csv.zip https://www.inegi.org.mx/contenidos/masiva/denue/denue_${e}_csv.zip && unzip -oq etl/data/raw/denue/denue_${e}_csv.zip -d etl/data/raw/denue/$e; done
```

Censo 2020, AGEB/manzana urbana, 09 and 19:

```bash
for e in 09 19; do curl -sL -A "Mozilla/5.0" -o etl/data/raw/censo/ageb_mza_urbana_${e}_cpv2020_csv.zip https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/ageb_manzana/ageb_mza_urbana_${e}_cpv2020_csv.zip && unzip -oq etl/data/raw/censo/ageb_mza_urbana_${e}_cpv2020_csv.zip -d etl/data/raw/censo/$e; done
```

SCIAN 2023 official structure:

```bash
curl -sL -A "Mozilla/5.0" -o etl/data/raw/scian/estructura2023.xlsx https://www.inegi.org.mx/contenidos/app/scian/estructura2023.xlsx
```

Optional — inspect encodings, columns and null counts before loading:

```bash
npm run inspect
```

## 3. Load bronze (once per download)

Creates the schemas and empty bronze tables, then `COPY`s the CSVs and the
SCIAN workbook. Bronze DDL is idempotent; loading again appends, so drop the
bronze tables by hand if you need a clean reload.

```bash
npm run sql -- 00_
```

```bash
npm run sql -- 10_
```

```bash
npm run load:bronze
```

```bash
npm run load:scian
```

Expected: `denue_raw` 462,732 + 211,349 rows, `censo_ageb_raw` 68,941 +
79,916, `scian_raw` 2,115.

## 4. Build silver + gold (~80 s, repeatable)

Runs every `etl/sql/*.sql` in order. Never touches loaded bronze data.

```bash
npm run sql
```

Rebuild only gold after a change to a `30_`+ file:

```bash
npm run sql -- 3
```

## 5. Sanity checks before the demo (PROYECTO.md §5)

`sum(esperado) ≈ sum(n_estab)` for every node, join rate, and the spot-check
AGEBs:

```bash
docker compose exec -T db psql -U denue -d denue -c "select count(*) nodos, count(*) filter (where abs(se - sn) > 0.01) fallos from (select entidad_id, nivel_scian, scian_id, sum(esperado_pob) se, sum(n_estab) sn from gold.indice_suministro group by 1,2,3) x;" -c "select d.cve_ent, round(100.0*count(a.ageb_key)/count(*),2) join_rate_pct from bronze.denue_raw d left join silver.ageb a on a.ageb_key = d.cve_ent||d.cve_mun||d.cve_loc||d.ageb group by 1;" -c "select ageb_key, scian_id, n_estab, esperado_pob, indice_pob, indice_comercial from gold.indice_suministro where (ageb_key, scian_id) in (('0901600010158','722511'),('1903900014233','461110'),('1901900010083','722511'),('0901000011542','461110'),('0901500011017','722511'));"
```

Expected: `fallos = 0`; join rate 99.75 % (09) and 98.71 % (19); Polanco
restaurants ≈ 2.59 pob / 0.58 com, Cumbres abarrotes ≈ 0.09, San Pedro
restaurants ≈ 38.4.

Query-layer check (runs the three functions and a hand computation):

```bash
npm --prefix web run check:queries
```

## 6. Web app

```bash
cp web/.env.local.example web/.env.local
```

```bash
npm --prefix web install
```

Production build + start — **use this for the demo** (dev mode is ~2 s per
AGEB page because of React dev tooling):

```bash
npm --prefix web run build && npm --prefix web start
```

Open http://localhost:3000.

Dev server with hot reload, if you're editing:

```bash
npm --prefix web run dev
```

## 7. Demo path

1. `/` — read the one-paragraph method, click **Tiendas de abarrotes en Nuevo León**.
2. `/explorar` — point at "tiene 0, esperados 23.9 → índice 0.04"; show the
   banda histogram; tick **Ciudad de México** (URL changes, page resets to 1).
3. Click an AGEB key → `/ageb/…` — "what's missing here", abarrotes on top.
   Switch **Demanda según → Actividad comercial** to show the lens change.
4. Browser back → same filtered list. Copy the URL, open in a new tab → same view.
5. `/ageb/0901600010158?demanda=comercial&nivel=clase` — Polanco: 2.6× restaurants
   by population, 0.58 by commercial mass. Explain why.
6. `/metodologia` — α, bandas, confidence rule, the five limitations.

Curated URLs (also linked from `/`):

- `/explorar?entidades=19&nivel=clase&scian=461110&demanda=poblacion&orden=indice_asc&pagina=1&minPob=500`
- `/explorar?entidades=09&nivel=clase&scian=722515&demanda=poblacion&orden=indice_asc&pagina=1&minPob=500`
- `/ageb/0901600010158?demanda=comercial&nivel=clase`
- `/ageb/1903900014233?demanda=poblacion&nivel=clase`

## 8. Tear down

```bash
docker compose down
```

Add `-v` to also delete the Postgres volume (forces a full reload next time).

## Troubleshooting

- `docker: command not found` in a fresh terminal → open a new tab after
  Docker Desktop's first launch, or use
  `/Applications/Docker.app/Contents/Resources/bin/docker`.
- `npm run sql` fails on `23_silver_establecimiento.sql` with FK errors →
  bronze is empty; run step 3.
- Typeahead finds nothing for "gimnasio" → SCIAN names are formal
  ("Centros de acondicionamiento físico"); search by code prefix (`7139`) or
  the official wording.
- Web pages error with `DATABASE_URL is not set` → `web/.env.local` missing
  (step 6).
