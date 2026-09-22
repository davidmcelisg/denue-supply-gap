// Formatting only. No arithmetic here (PROYECTO.md §0.2).
import type { Banda, Demanda, NivelScian, OrdenExplorar } from './types';

const es = 'es-MX';
export const fmtInt = (n: number) => n.toLocaleString(es, { maximumFractionDigits: 0 });
export const fmtDec = (n: number, d = 2) => n.toLocaleString(es, { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (ratio: number, d = 0) =>
  ratio.toLocaleString(es, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d });

export const BANDA_LABEL: Record<Banda, string> = {
  muy_bajo: 'Muy bajo', bajo: 'Bajo', normal: 'Normal', alto: 'Alto', muy_alto: 'Muy alto',
};
export const BANDA_CLASS: Record<Banda, string> = {
  muy_bajo: 'bg-red-100 text-red-800 border-red-200',
  bajo: 'bg-orange-100 text-orange-800 border-orange-200',
  normal: 'bg-stone-100 text-stone-700 border-stone-200',
  alto: 'bg-sky-100 text-sky-800 border-sky-200',
  muy_alto: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};
export const BANDA_BAR_CLASS: Record<Banda, string> = {
  muy_bajo: 'bg-red-400', bajo: 'bg-orange-300', normal: 'bg-stone-300', alto: 'bg-sky-300', muy_alto: 'bg-indigo-400',
};

export const NIVEL_LABEL: Record<NivelScian, string> = { sector: 'Sector', subsector: 'Subsector', clase: 'Clase' };
export const DEMANDA_LABEL: Record<Demanda, string> = { poblacion: 'Población', comercial: 'Actividad comercial' };
export const ORDEN_LABEL: Record<OrdenExplorar, string> = {
  indice_asc: 'Índice ascendente (más faltante primero)',
  indice_desc: 'Índice descendente (más saturado primero)',
  poblacion_desc: 'Población descendente',
  n_estab_desc: 'Establecimientos descendente',
};
export const ENTIDAD_LABEL: Record<string, string> = { '09': 'Ciudad de México', '19': 'Nuevo León' };
