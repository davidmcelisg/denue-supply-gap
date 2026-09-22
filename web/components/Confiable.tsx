export const TITULO_NO_CONFIABLE =
  'Categoría con menos de 30 establecimientos en la entidad: la tasa base es ruidosa y el índice no es confiable.';

export function MarcaNoConfiable() {
  return (
    <span title={TITULO_NO_CONFIABLE} className="ml-1 cursor-help text-stone-400" aria-label="no confiable">
      ⚠︎
    </span>
  );
}
