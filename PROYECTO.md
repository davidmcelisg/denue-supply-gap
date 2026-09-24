# denue-supply-gap — Project Spec

Finds over- and under-supplied business categories across Mexican census tracts
(AGEBs), using INEGI's DENUE establishment registry benchmarked against the
typical rate for the same entidad. Scope: Ciudad de México (09) and Nuevo León (19).

Primary goal: a working, credible demo for a technical audience (CTO of a data
company) as fast as possible. Correctness of the numbers matters more than UI
polish.

---

## 0. Working rules

### 0.1 How to work

- **Phases 0–3 (ETL): one task at a time.** Finish the task, run its acceptance
  checks, report results, and stop for confirmation before the next task.
- **Phases 4–5 (query layer + web): may batch** multiple tasks within the same
  phase, but stop at the end of each phase for review.
- When a task's acceptance check fails, report it and propose a fix. Do not work
  around it silently.

### 0.2 Hard constraints

- **No LLM anywhere in the product.** Natural-language querying is out of scope.
- **No metric arithmetic in React.** Every rendered number comes from a gold
  table or a query that reads gold. Components may only format
  (`toLocaleString('es-MX')`, decimals, label/color lookup). The only arithmetic
  allowed in a component is page bookkeeping that is not a metric: row
  positions in `/explorar`, and the bar width in `ResumenBandas` (the counts
  next to the bars are SQL values).
- **Never edit bronze.** If a cleaning rule is wrong, rebuild silver from bronze.
- **Never delete rows in silver for quality reasons.** Flag them. Gold decides
  what to filter.
- **The metric is never computed at request time.** The index, esperado, banda
  and percentil for every (AGEB × node) are precomputed in
  `gold.indice_suministro`. Pages may aggregate those precomputed rows in SQL
  (`/explorar` runs a `count`, a `percentile_cont` and a `GROUP BY` for the
  summary), but never recompute the metric itself.

### 0.3 Timebox

Phases 0–3 target **3 days**. Imperfect cleaning is acceptable; flagged rows are
acceptable. Do not attempt entity resolution beyond what T2.4 specifies.

---

## 1. The metric

### 1.1 Definition (location quotient with smoothing)

For AGEB `a`, SCIAN node `s` (at sector, subsector, or clase level), within
entidad `e`:

```
n(a,s)         = establishments of node s in AGEB a
pob(a)         = population of AGEB a
N(s,e)         = total establishments of node s across eligible AGEBs in e
P(e)           = total population across eligible AGEBs in e

tasa(s,e)      = N(s,e) / P(e)                  -- entidad-wide rate per person
esperado(a,s)  = pob(a) * tasa(s,e)             -- expected count if a were typical

indice_pob(a,s) = (n(a,s) + α) / (esperado(a,s) + α)      α = 1 (configurable)
```

Commercial variant (demand proxy = total commercial activity instead of people):

```
ntot(a)              = all establishments in AGEB a, all SCIAN nodes
NTOT(e)              = all establishments across eligible AGEBs in e
esperado_com(a,s)    = ntot(a) * N(s,e) / NTOT(e)
indice_comercial(a,s)= (n(a,s) + α) / (esperado_com(a,s) + α)
```

`indice < 1` → undersupplied relative to what's typical in the entidad.
`indice > 1` → oversupplied.

**Why not a median baseline:** for most clases the median AGEB has zero
establishments, so a median-density baseline is zero and the index divides by
zero. The rate-based expected count avoids this and is the standard approach in
economic geography.

**Why α:** an AGEB expecting 0.2 cafés that has 1 would otherwise score 5.0. The
pseudocount shrinks small-sample indices toward 1. Keep α in one config place so
it can be tuned without touching logic.

**Baselines are per entidad**, not pooled across CDMX and NL. The two economies
differ; each AGEB is compared against its own entidad.

### 1.2 Grain rule

**An index is only valid at the grain it was computed at.** A sector's index is
NOT derived from its clases' indices. Gold stores rows at three levels —
`sector`, `subsector`, `clase` — each computed from counts at that level.

`rama` and `subrama` exist in silver for hierarchy integrity but are not
exposed in the UI.

### 1.3 Banda (fixed thresholds on the index)

| banda | indice |
|---|---|
| muy_bajo | < 0.5 |
| bajo | 0.5 – 0.8 |
| normal | 0.8 – 1.25 |
| alto | 1.25 – 2.0 |
| muy_alto | ≥ 2.0 |

Thresholds on the index itself, not percentile buckets — percentile buckets
would always put 10% of AGEBs in `muy_bajo` whether or not real gaps exist.
`percentil` is still stored separately as a column for ranking context.

### 1.4 Confidence

A node is `confiable` in entidad `e` if `N(s,e) >= 30`. Below that, the rate is
too noisy: rows render greyed and never rank first.

### 1.5 Known limitations — surface these in the UI

1. **No revenue, foot traffic, or profitability** in DENUE. The product claims
   only relative supply, never business performance.
2. **Commercial gravity.** Population misrepresents demand where daytime and
   residential population diverge (Centro Histórico, Santa Fe, San Pedro).
   `indice_comercial` exists for this reason.
3. **Vintage mismatch.** DENUE edición 2026-05 (`max(fecha_alta)` = 2026-04)
   against population from Censo 2020. Render as a footnote sourced from query
   `contexto`; the edition string lives in `gold.config`, never hardcoded.
4. **Estrato is a range bucket**, not a headcount. Never show point estimates of
   employment.
5. **Urban AGEBs only** for population (see T1.2); establishments in rural areas
   won't join and are excluded from the metric.

---

## 2. Stack & layout

- **Postgres 16** via Docker Compose. Schemas: `bronze`, `silver`, `gold`.
- **Next.js (App Router), TypeScript** in `web/`.
- **Direct SQL** (`postgres.js` or `pg`). No ORM.
- **No PostGIS in v1** — DENUE carries the AGEB key, so the metric is plain
  `GROUP BY`s.
- Transforms are numbered `.sql` files run in order by one runner script.

```
denue-supply-gap/
├── README.md             # what it is, how it works, how to run it
├── CLAUDE.md
├── PROYECTO.md
├── DEMO.md               # end-to-end run + demo path
├── docker-compose.yml
├── .env.local            # gitignored: INEGI_TOKEN, DATABASE_URL
├── etl/
│   ├── sql/              # 00_schemas.sql, 10_bronze_*.sql, 20_silver_*.sql, 30_gold_*.sql
│   ├── scripts/          # runner, loaders, inspection
│   └── data/raw/         # gitignored downloads
└── web/                  # Next.js app
```

---

## 3. What we already know about the data

From a live API test (`Buscar` method) and INEGI docs:

- **The API does not return AGEB.** `Buscar` returns a field subset without it.
  The pipeline depends entirely on the **bulk files (Descarga Masiva)**, which
  must carry AGEB. The API is not a fallback for the core pipeline.
- **Empty strings, not nulls.** `Correo_e`, `Sitio_internet` come as `""`. All
  completeness checks must test `''` as well as `NULL`.
- **`Razon_social` mixes persons and companies** (personas físicas appear as a
  person's name). Don't use it for chain detection; use `Nombre` if ever needed.
- **`Estrato` arrives as display text** (e.g. `"6 a 10 personas"`). Build the
  mapping from distinct values found in bronze; don't assume the bucket list.
- **CLEE is a composite:** starts with entidad (2), municipio (3), then the SCIAN
  clase (6). Use it as a **consistency check** against the parsed columns and
  flag disagreements. Do not derive fields from it.
- **Whitespace padding and joined fields** (e.g. `Ubicacion` concatenates
  localidad, municipio, entidad with heavy padding). Prefer the bulk file's
  separate columns; trim everything.
- **Encoding is likely Latin-1**, not UTF-8. Verify before loading —
  `Cuauhtémoc` is the canary.

---

## 4. Task list

### Phase 0 — Setup

**T0.1 — INEGI token** ✅ DONE. Token is in `.env.local` as `INEGI_TOKEN`.
Never commit it.

**T0.2 — Scaffold** ✅ DONE
- `docker-compose.yml`: Postgres 16, named volume, port 5432.
- `DATABASE_URL` in `.env.local`; confirm `.env.local` and `etl/data/raw/` are
  gitignored.
- `etl/sql/00_schemas.sql` creating `bronze`, `silver`, `gold`.
- `etl/scripts/run-sql.ts`: executes `etl/sql/*.sql` in filename order, logs
  each file and duration, stops on first error. Support running a single prefix
  (e.g. only `30_*`) to rebuild gold quickly.
- Do NOT scaffold `web/` yet.

*Accept:* `docker compose up -d`, runner executes `00_schemas.sql`, and a query
lists the three schemas.

---

### Phase 1 — Bronze

**T1.1 — Download DENUE bulk files** ✅ DONE (edición 05/2026)
From INEGI Descarga Masiva, DENUE for entidades 09 and 19 (CSV). Save to
`etl/data/raw/denue/`. If the download can't be automated reliably, stop and
tell David which files to download manually and where to put them.

*Accept:* files present, sizes and row counts logged.

**T1.2 — Download AGEB population** ✅ DONE
Censo de Población y Vivienda 2020, **urban AGEB and manzana results** for 09
and 19. Save to `etl/data/raw/censo/`.

These files mix row types (entidad, municipio, localidad, and AGEB totals, plus
manzana rows). Identify how AGEB-total rows are marked by inspection — don't
assume. Population column is expected to be `POBTOT`; confirm.

*Accept:* files present, row counts logged.

**T1.2b — Inspection script (run before any loader)** ✅ DONE
`etl/scripts/inspect.ts`: for each raw file, print detected encoding, delimiter,
column names, first 5 rows, and per-column null/empty counts over the first
10,000 rows.

*Accept:* David reviews output. Must confirm:
1. DENUE bulk file **has an AGEB column** (and manzana). If it does not, STOP —
   the grain of the whole project changes.
2. Accented text renders correctly under the chosen encoding.
3. How AGEB-total rows are identified in the Censo file.

**T1.3 — Load bronze** ✅ DONE
```
bronze.denue_raw        -- every source column as text
                        -- + source_file, edicion, ingested_at
bronze.censo_ageb_raw   -- every source column as text
                        -- + source_file, anio, ingested_at
```
Use `COPY` with the encoding found in T1.2b. No casting, no cleaning, no dropped
columns. Load all Censo rows (all row types); filtering happens in silver.

*Accept:* row counts in bronze match source files exactly.

---

### Phase 2 — Silver

**T2.1 — SCIAN hierarchy** ✅ DONE
```
silver.scian_sector      -- id, nombre
silver.scian_subsector   -- id, sector_id, nombre
silver.scian_rama        -- id, subsector_id, nombre
silver.scian_subrama     -- id, rama_id, nombre
silver.scian_clase       -- id, subrama_id, nombre
```
Clase ids are 6 digits; parents are prefixes (sector 2, subsector 3, rama 4,
subrama 5). SCIAN sectors 31–33 and 48–49 are grouped ranges (43 and 46 are standalone in SCIAN) — handle each
group as a single sector. Names from DENUE's class text and the official SCIAN
catalog.

*Accept:* zero orphans at every level; every clase in bronze resolves to a
sector.

**T2.2 — Estrato** ✅ DONE
```
silver.estrato -- id, etiqueta, personal_min, personal_max
```
Built from distinct values in bronze.

*Accept:* every bronze estrato value maps to a row.

**T2.3 — Geography** ✅ DONE
```
silver.municipio -- id (entidad+municipio, 5 chars), entidad_id, nombre
silver.ageb      -- ageb_key (PK), entidad_id, municipio_id, localidad_id,
                    poblacion, es_elegible
```
`ageb_key` = entidad(2) + municipio(3) + localidad(4) + ageb(4), all
zero-padded strings. Build it identically on both sides (DENUE and Censo).
`es_elegible = poblacion >= 500`.

*Accept:* **join rate** of DENUE establishments to a silver.ageb row is logged
per entidad. Target ≥90%. If lower, report unmatched counts by municipio before
proceeding (rural areas explain some loss and concentrate in specific
municipios; key-construction bugs look different — uniform loss everywhere).

**T2.4 — Establecimiento** ✅ DONE
```
silver.establecimiento
  clee (PK), id_establecimiento, nombre, nombre_norm,
  razon_social, razon_social_norm, clase_id, estrato_id,
  ageb_key, municipio_id, lat, lon, tiene_contacto, calidad_flags text[]
```
Exactly these cleaning rules:
1. **Normalize names** into `_norm`: uppercase, strip accents, collapse
   whitespace, strip legal suffixes (`S.A. DE C.V.`, `SA DE CV`, `S. DE R.L.`,
   `S.C.`, `S.A.P.I.`). Keep originals.
2. **Dedupe on CLEE** (true key). Near-duplicates (same `nombre_norm`, within
   ~50m) get flagged `posible_duplicado`, never merged. Names containing
   `SIN NOMBRE` (DENUE placeholder for unnamed businesses) are excluded.
3. **Coordinate sanity**: outside the entidad bounding box → `coord_sospechosa`.
4. **CLEE consistency**: embedded entidad/municipio/clase disagree with parsed
   columns → `clee_inconsistente`.
5. **Contact**: `tiene_contacto` = any of phone/email/web non-empty (test `''`).

Other flags: `sin_ageb` (no silver.ageb match).

*Accept:* row count within 1% of bronze; flag counts logged per flag; zero
rows deleted for quality reasons.

---

### Phase 3 — Gold

Eligible scope for every gold computation: establishments whose AGEB exists in
silver.ageb with `es_elegible = true`.

**T3.1 — Counts** ✅ DONE
```
gold.conteo_ageb_scian
  ageb_key, entidad_id, nivel_scian, scian_id, n_estab,
  poblacion, n_estab_total_ageb
```
`nivel_scian ∈ ('sector','subsector','clase')`.

**Must include zero rows**: cross join eligible AGEBs × SCIAN nodes present in
that entidad, left join counts, coalesce to 0. Without zeros, the undersupplied
ranking silently drops the most undersupplied places.

Before building, log `eligible AGEBs × nodes` per entidad per nivel and report
it. If clase grain is unmanageable, restrict clase rows to `confiable` clases
only (T3.2 rule) and note the restriction in `contexto`.

*Accept:* row counts per nivel logged; `sum(n_estab)` per (entidad, nivel)
equals the count of eligible establishments; hand-verify one AGEB × clase
against silver.

**T3.2 — Rates** ✅ DONE
```
gold.tasa_scian
  entidad_id, nivel_scian, scian_id, n_total, pob_total, ntot_total,
  tasa_pob, tasa_com, confiable
```
`tasa_pob = N(s,e)/P(e)`, `tasa_com = N(s,e)/NTOT(e)`, `confiable = n_total >= 30`.

*Accept:* one row per (entidad, nivel, scian) present in T3.1.

**T3.3 — Index** ✅ DONE
```
gold.indice_suministro
  ageb_key, entidad_id, nivel_scian, scian_id,
  n_estab, poblacion, n_estab_total_ageb,
  esperado_pob, esperado_com,
  indice_pob, indice_comercial,
  percentil_pob, percentil_com,
  banda_pob, banda_com, confiable
```
Formulas per §1.1, bandas per §1.3, percentiles via `percent_rank()` within
(entidad, nivel, scian). α in a single config location.

Indexes: `(nivel_scian, scian_id, entidad_id, indice_pob)`,
`(nivel_scian, scian_id, entidad_id, indice_comercial)`, `(ageb_key)`.

*Accept:*
- For every (entidad, nivel, scian): `sum(esperado_pob) ≈ sum(n_estab)` (true
  by construction — if not, the rate join is wrong).
- A single-node query across all AGEBs returns in < 100 ms.
- Spot-check three AGEBs David knows personally; numbers should be explainable.

*Spot-check result (2026-09-21, confirmed by David — reuse for curated findings):*

| Area | ageb_key | pob | estabs | restaurantes 722511 | abarrotes 461110 | gimnasios 713943 |
|---|---|---|---|---|---|---|
| Del Valle, San Pedro GG | `1901900010083` | 1,374 | 1,292 | 38.4 (com. gravity) | 1.37 | 11.4 |
| Cumbres, Monterrey | `1903900014233` | 3,015 | 60 | 0.43 | 0.09 | 1.17 |
| Santa Fe, CDMX | `0901000011542` | 2,898 | 489 | 11.4 | 0.15 | 4.92 |
| Roma Norte, CDMX | `0901500011017` | 4,538 | 669 | 8.6 | 0.45 | 0.50 |
| Polanco, CDMX | `0901600010158` | 4,030 | 1,070 | 2.59 pob / 0.58 com | — | — |

**T3.4 — Affinity (OPTIONAL, cut if time is short)** ⏭ NOT BUILT
```
gold.afinidad_pares
  entidad_id, clase_a, clase_b, n_co, lift
```
Presence-based: `lift = P(both present in AGEB) / (P(a present) * P(b present))`
over eligible AGEBs. Only clases present in ≥ 20 AGEBs; only pairs with
`n_co >= 10`.

*Accept:* top 20 pairs by lift inspected; not dominated by obvious artifacts.

---

### Phase 4 — Query layer

**T4.1 — Types and queries** ✅ DONE in `web/lib/queries.ts` (scaffold `web/` now with
`create-next-app`, TypeScript, App Router).

```ts
type NivelScian = 'sector' | 'subsector' | 'clase';
type Banda = 'muy_bajo' | 'bajo' | 'normal' | 'alto' | 'muy_alto';
type Demanda = 'poblacion' | 'comercial';
type OrdenExplorar = 'indice_asc' | 'indice_desc' | 'poblacion_desc' | 'n_estab_desc';

type FiltrosExplorar = {
  entidades: string[];        // ['09','19']
  nivel: NivelScian;
  scianId: string;
  demanda: Demanda;
  orden: OrdenExplorar;
  pagina: number;             // 1-based
  minPob: number;             // >= 500
};

type FilaAgeb = {
  agebKey: string;
  municipioNombre: string;
  entidadNombre: string;
  poblacion: number;
  nEstab: number;
  nEstabTotalAgeb: number;
  esperado: number;           // resolved per `demanda`
  indice: number;             // resolved per `demanda`
  percentil: number;
  banda: Banda;
  confiable: boolean;
};

type RespuestaExplorar = {
  filas: FilaAgeb[];
  total: number;
  resumen: {
    nAgebs: number;
    medianaIndice: number;
    conteoPorBanda: Record<Banda, number>;
  };
  contexto: {
    scianNombre: string;
    nTotalPorEntidad: Record<string, number>;
    edicionDenue: string;     // '2026-05', from gold.config
    anioCenso: number;        // 2020
    alpha: number;
  };
};

type FilaScian = {
  scianId: string;
  scianNombre: string;
  nivel: NivelScian;
  nEstab: number;
  esperado: number;
  indice: number;
  percentil: number;
  banda: Banda;
  confiable: boolean;
};
```

`indice`/`esperado`/`banda`/`percentil` are **resolved in SQL** per `demanda`.
Never send both variants and choose in React. `resumen` aggregates are computed
in SQL too.

Functions:
- `explorarPorScian(f: FiltrosExplorar): Promise<RespuestaExplorar>`
- `detallarAgeb(agebKey: string, demanda: Demanda, nivel: NivelScian): Promise<FilaScian[]>`
- `buscarScian(q: string, nivel?: NivelScian)` — typeahead, accent-insensitive

Page size: 25. Offset pagination (bounded sets, indexed sort column).

*Accept:* each function runs from a script and returns correctly shaped data;
`explorarPorScian` checked against a hand-computed row.

---

### Phase 5 — Web ✅ DONE (2026-09-21; T3.4 /afinidad not built)

**Screens**
- `/` — short landing: what the product answers, one-paragraph method, links to
  the two views, and 2–3 curated example findings (links with prefilled
  searchParams).
- `/explorar` — category-first: "where is X missing?" Fix a SCIAN node, rank
  AGEBs, ascending index by default.
- `/ageb/[ageb_key]` — area-first: "what's missing here?" Fix an AGEB, rank
  SCIAN nodes.
- `/metodologia` — the metric, α, bandas, confidence rule, and every limitation
  in §1.5. This page matters for the demo. `/` and `/metodologia` are
  `force-dynamic`: both read `gold.config` and `gold.resumen_calidad`, and a
  prerendered copy would keep showing figures from the last web build after an
  ETL rebuild.
- `/afinidad` — only if T3.4 was built.

**URL state** — everything that changes what's on screen lives in `searchParams`:
```
/explorar?entidades=09,19&nivel=clase&scian=722515&demanda=poblacion
         &orden=indice_asc&pagina=1&minPob=500
```
No filter state in `useState`. Invalid/missing params fall back to defaults.
Changing any filter or `orden` resets `pagina` to 1.

**Component shape**
- Pages are **server components** calling query functions directly.
- Filter rail is a **client component** (`useRouter`, `useSearchParams`) that
  only pushes URLs; it owns no data.
- One **route handler**: `/api/scian/buscar?q=` for the typeahead (debounced).
- `loading.tsx` and `error.tsx` per route.

**UI rules**
- `confiable === false` → greyed row with tooltip; never ranked first.
- Changing `nivel` in `/explorar` keeps the category by walking the SCIAN
  hierarchy: up to the parent, or down to the child with the most
  establishments in the selected entidades. The page resolves it server-side and
  `redirect()`s so the URL stays canonical. An unknown code resolves to null and
  falls through to the empty state.
- `/ageb` ranks every node of the entidad (~900 clases, most of them zero). It
  renders the first `DETALLE_SIZE` (50) with a `?todas=1` escape hatch. Without
  the limit the page is 2.3 MB of mostly-zero rows and the readable answer is
  below the fold.
- Show `n_estab` and `esperado` next to the index so every number is
  explainable ("2 vs. 7.4 esperados").
- Empty states distinguish "no AGEB matches these filters" from "this category
  has no establishments in these entidades."
- Footnote on every data view with vintage mismatch from `contexto`.
- Spanish UI copy. Numbers formatted `es-MX`.
- Clean and restrained visually; clarity over decoration.

*Accept (end of phase):* David can go from landing → a curated finding →
drill into that AGEB → back button returns to the same filtered list; a shared
URL reproduces the exact view.

---

### Phase 6 — Bug injection drill (OPTIONAL, later — Paraform prep)

On a separate branch, inject 8 realistic bugs into the working app and commit
without showing the diff. Write the bug list to an untracked file David opens
only after the drill. Draw from: stale closure, missing `await`, bad list
`key`, mutated state, pagination off-by-one, route handler wrong shape,
server/client boundary violation, hydration mismatch, filter not resetting
pagination, searchParams not round-tripped. David debugs cold, no AI.

---

## 5. Pre-demo checklist

- `sum(esperado) ≈ sum(n_estab)` holds for all nodes after the latest rebuild.
- Join rate per entidad still at target.
- Three personally known AGEBs produce explainable numbers. (If Polanco reads as
  undersupplied in restaurants, something is wrong.)
- One commercial-heavy AGEB shows `indice_pob` and `indice_comercial`
  diverging, and the divergence is explainable.
- Every number on screen traces to a gold column.
- Curated findings on `/` still resolve after the latest rebuild.
