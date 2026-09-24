# denue-supply-gap

Read `PROYECTO.md` before doing anything. It is the single source of truth.
If this file and PROYECTO.md ever disagree, PROYECTO.md wins.

## How to work
- ETL phases (0–3): one task at a time. Run the task's acceptance checks,
  report results, then STOP and wait for confirmation.
- Web phases (4–5): may batch tasks within a phase; stop at the end of the phase.
- If an acceptance check fails, report it and propose a fix. Never work around
  it silently.
- Mark tasks done in PROYECTO.md (✅) once confirmed.

## Never
- Commit `.env.local`, the INEGI token, or anything in `etl/data/raw/`.
- Edit bronze tables. Rebuild silver from bronze instead.
- Delete silver rows for quality reasons. Flag them in `calidad_flags`.
- Do arithmetic in React components. Numbers come from SQL; components format.
- Add an LLM feature.

## Layout
- `etl/sql/`      numbered transforms (00_, 10_, 20_, 30_), run in order
- `etl/scripts/`  runner, loaders, inspection
- `etl/data/raw/` downloads (gitignored)
- `web/`          Next.js app (scaffold only when Phase 4 starts)

## Commands
- `docker compose up -d` — start Postgres
- run-sql script — rebuild all transforms, or a single prefix (e.g. `30_`).
  `90_checks.sql` always runs last, including on a prefix run, and aborts on
  any broken invariant. It reports each check through `RAISE NOTICE`.
