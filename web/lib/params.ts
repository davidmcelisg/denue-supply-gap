// URL state <-> FiltrosExplorar. Everything that changes what is on screen
// lives in searchParams (PROYECTO.md Phase 5). Invalid or missing values
// fall back to defaults; no filter state is ever held in React state.
import {
  DEMANDAS, ENTIDADES, NIVELES, ORDENES,
  type Demanda, type FiltrosExplorar, type NivelScian, type OrdenExplorar,
} from './types';

export type SearchParams = Record<string, string | string[] | undefined>;

export const FILTROS_DEFAULT: FiltrosExplorar = {
  entidades: [...ENTIDADES],
  nivel: 'clase',
  scianId: '722515',
  demanda: 'poblacion',
  orden: 'indice_asc',
  pagina: 1,
  minPob: 500,
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function parseFiltros(sp: SearchParams): FiltrosExplorar {
  const ents = (first(sp.entidades) ?? '').split(',').filter((e) => ENTIDADES.includes(e));
  const pagina = Number.parseInt(first(sp.pagina) ?? '', 10);
  const minPob = Number.parseInt(first(sp.minPob) ?? '', 10);
  const scian = (first(sp.scian) ?? '').trim();
  return {
    entidades: ents.length ? ents : FILTROS_DEFAULT.entidades,
    nivel: oneOf<NivelScian>(first(sp.nivel), NIVELES, FILTROS_DEFAULT.nivel),
    scianId: /^[0-9]{2,6}(-[0-9]{2})?$/.test(scian) ? scian : FILTROS_DEFAULT.scianId,
    demanda: oneOf<Demanda>(first(sp.demanda), DEMANDAS, FILTROS_DEFAULT.demanda),
    orden: oneOf<OrdenExplorar>(first(sp.orden), ORDENES, FILTROS_DEFAULT.orden),
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
    minPob: Number.isFinite(minPob) && minPob >= 500 ? minPob : FILTROS_DEFAULT.minPob,
  };
}

export function filtrosToQuery(f: FiltrosExplorar): string {
  const p = new URLSearchParams({
    entidades: f.entidades.join(','),
    nivel: f.nivel,
    scian: f.scianId,
    demanda: f.demanda,
    orden: f.orden,
    pagina: String(f.pagina),
    minPob: String(f.minPob),
  });
  return p.toString();
}

export function hrefExplorar(f: Partial<FiltrosExplorar>): string {
  return `/explorar?${filtrosToQuery({ ...FILTROS_DEFAULT, ...f })}`;
}

export function parseDemanda(v: string | string[] | undefined): Demanda {
  return oneOf<Demanda>(first(v), DEMANDAS, 'poblacion');
}
export function parseNivel(v: string | string[] | undefined): NivelScian {
  return oneOf<NivelScian>(first(v), NIVELES, 'clase');
}
