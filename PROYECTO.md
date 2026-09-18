# Índice de Suministro Comercial — Project Spec

A dashboard over INEGI's DENUE that identifies which areas of CDMX and Nuevo León
are over- or under-supplied with a given type of business, relative to peer areas.

---

## 0. Rules for whoever is implementing this

**Read this section before doing anything else.**

### 0.1 Division of labor

| Phase | Who writes it |
|---|---|
| 1–4 (ingestion, SQL, query layer) | Claude Code |
| 5 (all React / Next.js UI) | **David, by hand, no AI** |
| 6 (bug injection drill) | Claude Code, per instructions in that phase |

Phase 5 is deliberately excluded from AI assistance. The project exists partly to
rebuild React/Next.js muscle memory before a live debugging interview. If Claude
Code is asked to write a component in Phase 5, it should decline and point back
here.

Claude Code **may** in Phase 5: set up config files, install packages, explain a
concept when asked, and answer questions. It may **not** write JSX, hooks, or
component logic.

### 0.2 Hard constraints

- **No LLM anywhere in the product.** Natural-language querying is explicitly out
  of scope. Deferred to a possible v2.
- **No arithmetic in React.** If a number is rendered, it came out of a gold
  table. Components may format (`toLocaleString('es-MX')`, decimals, label and
  color lookup). They may not divide, sum, or compute percentages.
- **Never delete rows in silver.** Bad data gets flagged, not removed. Gold
  decides what to filter out.
- **Never edit bronze.** If a cleaning rule is wrong, rebuild silver from bronze.
  Don't re-download.
- **No analysis at request time.** The UI reads precomputed gold tables only.

### 0.3 Timebox

Phases 1–4 get **three days**. Then stop and move to Phase 5 even if cleaning is
imperfect. Flagged rows are acceptable. Entity resolution is a rabbit hole — do
not go in.

---

## 1. The metric

### 1.1 Definition

For an AGEB `a` and a SCIAN node `s` (at sector, subsector, or clase level):

```
supply(a,s)       = count of establishments of SCIAN node s in a
demanda_pob(a)    = population of a
demanda_com(a)    = total establishments in a, all SCIAN nodes

densidad_pob(a,s)      = supply(a,s) / (demanda_pob(a) / 10000)
densidad_comercial(a,s)= supply(a,s) / demanda_com(a)

baseline(s, entidad)   = median densidad(·,s) across eligible AGEBs in entidad
indice(a,s)            = densidad(a,s) / baseline(s, entidad)
```

`indice < 1` → undersupplied. `indice > 1` → oversupplied.

Two indices are computed (`indice_pob`, `indice_comercial`). The UI shows one at
a time, selected by the user. When they disagree sharply, that is itself
informative.

### 1.2 Grain rule (important)

**An index is only valid at the grain its baseline was computed at.** The density
of a sector is NOT the sum of the densities of its clases. Gold therefore stores
rows at three separate levels — `sector`, `subsector`, `clase` — each with its
own baseline over its own counts.

`rama` and `subrama` are computed in silver (for hierarchy integrity) but are
**not** exposed in the UI. Five levels is too many clicks.

### 1.3 Known limitations — state these in the UI, don't hide them

1. **No revenue, no foot traffic, no profitability.** DENUE has none of it. The
   product can only claim an area is over- or under-supplied relative to peers.
   It can never claim a business is doing well.
2. **Commercial gravity.** Population is a bad demand proxy where daytime
   population differs wildly from residential (Centro Histórico, Santa Fe, San
   Pedro). This is why `indice_comercial` exists as an alternative.
3. **Vintage mismatch.** DENUE edition is based on Censos Económicos 2024;
   population comes from Censo 2020. Four-year gap between numerator and
   denominator. Surface this as a footnote sourced from `contexto`, not
   hardcoded in JSX.
4. **Estrato is a bucket, not a number.** Personal ocupado is a range
   (`0 a 5 personas`, etc.). Never present a point estimate for employment.
   Present ranges, or don't present it.

### 1.4 Guards against degenerate values

- **Population floor:** AGEBs with `poblacion < 500` are marked
  `es_elegible = false` and excluded from baselines and from ranking. Store the
  raw rows anyway so the floor can be tuned without reprocessing.
- **Pseudocount:** add a small constant to the denominator so no division
  approaches zero.
- **Baseline confidence:** store `n_agebs_considerados` per baseline. If below
  the threshold (start at 30), the row renders greyed and does not rank first.

---

## 2. Stack

- **Postgres 16**, local via Docker Compose. One database, three schemas:
  `bronze`, `silver`, `gold`.
- **Next.js (App Router), TypeScript.**
- **Direct SQL** via `pg` or `postgres.js`. No ORM — the queries are analytical
  and an ORM adds indirection with no benefit here.
- **No PostGIS in v1.** DENUE already carries the AGEB key as a field, so the
  core metric is a plain `GROUP BY` on a column we already have. Add PostGIS only
  if radius search or real map polygons are needed later.
- Transforms are numbered `.sql` files under `/sql`, executed by one runner
  script. Not dbt — dbt is the right tool with more models and a team; for ~10
  models a runner has less to explain.

---

## 3. Task list

Each task has acceptance criteria. Do them in order. Do not start a phase before
the previous one passes its checks.

---

### Phase 0 — Setup

**T0.1 — Obtain INEGI token**
Register at INEGI to get a free API token (emailed, one address per token).
Store in `.env.local` as `INEGI_TOKEN`. Add `.env.local` to `.gitignore`.

*Accept:* a single curl against the DENUE API returns JSON.

**T0.2 — Scaffold**
- `create-next-app` with TypeScript, App Router.
- `docker-compose.yml` with Postgres 16, a named volume, port 5432.
- `DATABASE_URL` in `.env.local`.
- `/sql` directory, `/scripts` directory.
- `scripts/run-sql.ts` — executes numbered `.sql` files in order, logs each.

*Accept:* `docker compose up -d` then a connection test prints the Postgres
version.

---

### Phase 1 — Bronze

**T1.1 — Download DENUE bulk data**
Use INEGI **Descarga Masiva**, not the API. Pull entidades `09` (Ciudad de
México) and `19` (Nuevo León). Save to `/data/raw/`, gitignored.

Do NOT page through the API for bulk rows.

*Accept:* files on disk, row counts logged.

**T1.2 — Download AGEB population**
Censo de Población y Vivienda 2020, AGEB-level resultados, same two entidades.

*Accept:* files on disk, row counts logged.

**T1.3 — Load into bronze**
```
bronze.denue_raw        -- all ~31 DENUE fields, ALL COLUMNS AS text
                        -- + source_file, edicion, ingested_at
bronze.censo_ageb_raw   -- as downloaded, all columns as text
                        -- + source_file, anio, ingested_at
```
No casting, no cleaning, no dropped columns at this stage.

*Accept:* `SELECT count(*)` on both tables matches the source file row counts
exactly.

---

### Phase 2 — Silver

**T2.1 — SCIAN hierarchy**
```
silver.scian_sector      -- id, nombre
silver.scian_subsector   -- id, sector_id, nombre
silver.scian_rama        -- id, subsector_id, nombre
silver.scian_subrama     -- id, rama_id, nombre
silver.scian_clase       -- id, subrama_id, nombre
```
Build from the SCIAN ID columns present in DENUE plus the official SCIAN
catalog. Every child must resolve to a parent.

*Accept:* zero orphans at every level. A recursive query from any clase reaches
a sector.

**T2.2 — Estrato**
```
silver.estrato -- id, etiqueta, personal_min, personal_max
```
Explicit min and max per bucket. This is what allows honest range statements.

*Accept:* every distinct estrato value in `bronze.denue_raw` maps to a row.

**T2.3 — Geography**
```
silver.municipio -- id, entidad_id, nombre
silver.ageb      -- ageb_key (PK), entidad_id, municipio_id, poblacion,
                    es_elegible
```

**Key construction gotcha:** DENUE stores AGEB as a short fragment. Censo files
key on the full composite — entidad + municipio + localidad + AGEB. Build the
composite key explicitly and **assert the join rate**.

*Accept:* **≥95% of establishments join to an AGEB with population.** Below
that, the key construction is wrong — fix it, don't work around it. Log the
actual rate.

**T2.4 — Establecimiento**
```
silver.establecimiento
  clee (PK), id_establecimiento, nombre, nombre_norm,
  razon_social, razon_social_norm, clase_id, estrato_id,
  ageb_key, municipio_id, lat, lon, tiene_contacto, calidad_flags
```

Exactly three cleaning rules. Resist adding more:

1. **Normalize names** into `_norm` columns: uppercase, strip accents, collapse
   whitespace, strip legal suffixes (`S.A. DE C.V.`, `SA DE CV`, `S. DE R.L.`,
   `S.C.`). Keep originals untouched.
2. **Dedupe on CLEE** — it is the real key. For near-duplicates (same
   `nombre_norm`, coordinates within ~50m), add a flag. Do NOT merge. A wrong
   merge is worse than a flagged duplicate.
3. **Coordinate sanity** — check lat/lon against the entidad bounding box.
   Outside → flag. Never delete.

`calidad_flags` is a text array or bitmask: `sin_ageb`, `coord_sospechosa`,
`posible_duplicado`, `sin_contacto`.

*Accept:* row count within 1% of bronze (only true CLEE dupes removed). Flag
counts logged per category. Zero deletions for coordinate or duplicate reasons.

---

### Phase 3 — Gold

**T3.1 — Density**
```
gold.densidad_ageb_scian
  ageb_key, nivel_scian, scian_id, n_estab, poblacion,
  n_estab_total_ageb, densidad_pob, densidad_comercial
```

`nivel_scian ∈ ('sector','subsector','clase')`.

**Zero rows matter.** This must be a cross join of eligible AGEBs against SCIAN
nodes, so that `n_estab = 0` pairs exist. Without them, the undersupplied
ranking silently excludes the most undersupplied places — the entire point of
the product.

**Check the row count before committing to clase grain.** Eligible AGEBs ×
clases can get large. If it's unmanageable, restrict clase-level rows to clases
with at least one establishment somewhere in the entidad, and note the
restriction in `contexto`.

*Accept:* row count logged per `nivel_scian`. Spot-check: pick one known AGEB and
one clase, verify `n_estab` by hand against silver.

**T3.2 — Baselines**
```
gold.baseline_scian
  nivel_scian, scian_id, entidad_id, mediana, p25, p75,
  n_agebs_considerados
```
Median over **eligible AGEBs only**, per entidad, per SCIAN node, per level.

*Accept:* every `(nivel, scian_id, entidad)` present in density has a baseline
row. `n_agebs_considerados` is never null.

**T3.3 — Index**
```
gold.indice_suministro
  ageb_key, nivel_scian, scian_id, indice_pob, indice_comercial,
  percentil, banda, n_estab, poblacion
```
`banda ∈ ('muy_bajo','bajo','normal','alto','muy_alto')`, bucketed from
percentile so the UI never recomputes thresholds.

Index these: `(nivel_scian, scian_id, indice_pob)`,
`(nivel_scian, scian_id, indice_comercial)`, `(ageb_key)`.

*Accept:* median `indice` for any SCIAN node is ≈1.0 by construction — if it
isn't, the baseline join is wrong. Query for one node across all AGEBs returns
in under 100ms.

**T3.4 — Affinity (OPTIONAL — cut without guilt)**
```
gold.afinidad_pares
  clase_a, clase_b, lift, n_co_ocurrencias
```
For each pair of clases, how often they co-occur in the same AGEB versus
expected by chance. Restrict to pairs above a co-occurrence floor or this
explodes.

*Accept:* top-20 lift pairs are inspected by a human and are not obvious
artifacts.

---

### Phase 4 — Query layer

**T4.1 — Types and query functions**

```ts
type NivelScian = 'sector' | 'subsector' | 'clase';
type Banda = 'muy_bajo' | 'bajo' | 'normal' | 'alto' | 'muy_alto';
type Demanda = 'poblacion' | 'comercial';
type OrdenExplorar =
  | 'indice_asc' | 'indice_desc'
  | 'poblacion_desc' | 'n_estab_desc';

type FiltrosExplorar = {
  entidades: string[];        // ['09','19']
  nivel: NivelScian;
  scianId: string;
  demanda: Demanda;
  orden: OrdenExplorar;
  pagina: number;             // 1-based
  minPob: number;
};

type FilaAgeb = {
  agebKey: string;
  municipioNombre: string;
  entidadNombre: string;
  poblacion: number;
  nEstab: number;             // of the selected SCIAN node
  nEstabTotalAgeb: number;
  indice: number;             // already resolved per `demanda`
  percentil: number;
  banda: Banda;
  baselineConfiable: boolean; // n_agebs_considerados >= umbral
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
    baselineMediana: number;
    nAgebsBaseline: number;
    edicionDenue: string;     // '2024'
    anioCenso: number;        // 2020
  };
};

type FilaScian = {
  scianId: string;
  scianNombre: string;
  nivel: NivelScian;
  nEstab: number;
  indice: number;
  percentil: number;
  banda: Banda;
  baselineConfiable: boolean;
};
```

`indice` is a **single resolved number**. The query picks based on `demanda`.
Do not ship both variants to the client and choose in React.

Functions to implement in `/lib/queries.ts`:
- `explorarPorScian(filtros: FiltrosExplorar): Promise<RespuestaExplorar>`
- `detallarAgeb(agebKey: string, demanda: Demanda): Promise<FilaScian[]>`
- `buscarScian(q: string, nivel?: NivelScian)` — for the typeahead

*Accept:* each function is callable from a script and returns correctly shaped
data. Unit-check `explorarPorScian` against a hand-computed row.

---

### Phase 5 — Frontend (DAVID WRITES THIS BY HAND — NO AI)

See §0.1. Claude Code does not write these components.

**Screens**

- `/explorar` — clase-first. "I want to open X. Where?" Fix the SCIAN node, rank
  AGEBs by index ascending.
- `/ageb/[ageb_key]` — AGEB-first. "What's missing here?" Fix the AGEB, rank
  SCIAN nodes.
- `/afinidad` — optional, last, cuttable.

Both main screens read the same gold table; one holds `scian_id` fixed, the
other holds `ageb_key` fixed.

**URL state — everything that changes the screen lives in `searchParams`**

```
/explorar
  ?entidades=09,19
  &nivel=clase
  &scian=722513
  &demanda=poblacion
  &orden=indice_asc
  &pagina=1
  &minPob=500
```

No filter state in `useState`. This makes findings shareable by link, makes the
back button work, and matches how App Router is designed.

**Component shape**

- **Page = server component.** Reads `searchParams`, calls the query function
  directly. No HTTP hop, no client waterfall.
- **Filter rail = client component.** `useRouter` + `useSearchParams`, pushes
  new URLs. Owns navigation, owns no data.
- **One route handler** — `/api/scian/buscar?q=` for the typeahead, which
  genuinely needs client-side fetching as the user types.
- **`loading.tsx` and `error.tsx`** per route.

That inventory covers server components, client components, the boundary,
searchParams, route handlers, streaming, and error boundaries.

**Edge cases to build now, not discover later**

- `nEstab = 0` rows must appear in the ranking (see T3.1).
- `baselineConfiable === false` → greyed row with tooltip. Not hidden, never
  ranked first.
- Empty results: distinguish "no AGEB matches these filters" from "this SCIAN
  node has no establishments in these entidades at all." Different copy,
  different user fix.
- **Pagination resets.** Changing any filter resets `pagina` to 1. Changing
  `orden` also resets. Forgetting one of these is the most common bug in this
  kind of screen.
- Offset pagination is fine — bounded sets, sorting on a precomputed indexed
  column. Keyset would be premature.

---

### Phase 6 — Bug injection drill

Run after Phase 5 works, as interview prep.

Claude Code: create a branch, inject **8 realistic bugs** into the working app,
and commit them **without showing the diff**. Write the list of bugs to a file
that stays uncommitted and unopened until the drill is over.

Bug classes to draw from:
- stale closure in an event handler
- missing `await` on a query
- wrong or index-based `key` in a list
- state mutated instead of replaced
- off-by-one in pagination offset
- route handler returning the wrong shape
- server/client component boundary violation
- hydration mismatch
- a filter that fails to reset pagination
- `searchParams` read but not round-tripped

David then debugs cold, with a timer, no AI.

---

## 4. Sanity checks to run before demoing

- Median index for any SCIAN node ≈ 1.0.
- Pick three AGEBs you know personally. Do the numbers match your intuition?
  If Polanco reads as undersupplied in restaurants, something is wrong.
- Compare `indice_pob` vs `indice_comercial` for a known commercial-but-low-
  residential AGEB. They should diverge, and the divergence should be
  explainable.
- Join rate from T2.3 is still ≥95% after any reprocessing.
- Every number on screen traces to a gold column.
