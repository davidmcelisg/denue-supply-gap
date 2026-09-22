// Vintage-mismatch footnote (PROYECTO.md §1.5.3). Values come from gold.config.
export function NotaVigencia({ edicionDenue, anioCenso, alpha }: { edicionDenue: string; anioCenso: number; alpha: number }) {
  return (
    <p className="mt-6 text-xs text-stone-500 leading-relaxed">
      Establecimientos: DENUE edición {edicionDenue}. Población: Censo {anioCenso}. Las dos fuentes tienen
      vigencias distintas; el índice compara la oferta actual contra la población de {anioCenso}. Índice suavizado con
      α = {alpha}. Solo AGEB urbanas con ≥ 500 habitantes. Este producto mide oferta relativa, no ingresos ni tráfico.
    </p>
  );
}
