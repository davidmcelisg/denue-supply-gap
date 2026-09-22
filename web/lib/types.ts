// Shapes shared by the query layer and the pages. Every numeric field here
// is produced by SQL over gold tables; components only format.

export type NivelScian = 'sector' | 'subsector' | 'clase';
export type Banda = 'muy_bajo' | 'bajo' | 'normal' | 'alto' | 'muy_alto';
export type Demanda = 'poblacion' | 'comercial';
export type OrdenExplorar = 'indice_asc' | 'indice_desc' | 'poblacion_desc' | 'n_estab_desc';

export const NIVELES: readonly NivelScian[] = ['sector', 'subsector', 'clase'];
export const BANDAS: readonly Banda[] = ['muy_bajo', 'bajo', 'normal', 'alto', 'muy_alto'];
export const DEMANDAS: readonly Demanda[] = ['poblacion', 'comercial'];
export const ORDENES: readonly OrdenExplorar[] = ['indice_asc', 'indice_desc', 'poblacion_desc', 'n_estab_desc'];
export const ENTIDADES: readonly string[] = ['09', '19'];

export const PAGE_SIZE = 25;

export type FiltrosExplorar = {
  entidades: string[];        // ['09','19']
  nivel: NivelScian;
  scianId: string;
  demanda: Demanda;
  orden: OrdenExplorar;
  pagina: number;             // 1-based
  minPob: number;             // >= 500
};

export type FilaAgeb = {
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

export type RespuestaExplorar = {
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
    edicionDenue: string;
    anioCenso: number;
    alpha: number;
  };
};

export type FilaScian = {
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

export type ResultadoBusqueda = {
  scianId: string;
  scianNombre: string;
  nivel: NivelScian;
};

export type DetalleAgeb = {
  agebKey: string;
  municipioNombre: string;
  entidadId: string;
  entidadNombre: string;
  poblacion: number;
  nEstabTotalAgeb: number | null;   // NULL when the AGEB is not eligible (no gold rows)
  esElegible: boolean;
};

export type ResumenCalidad = {
  cleeInconsistentePct: number;
  posibleDuplicadoPct: number;
  sinAgebPct: number;
  coordSospechosaN: number;
  agebNoElegibleN: Record<string, number>;
  agebNoElegiblePobShare: Record<string, number>;
  retailShare: Record<string, number>;
};
