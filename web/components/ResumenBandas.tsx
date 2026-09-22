import { BANDA_BAR_CLASS, BANDA_LABEL, fmtInt } from '@/lib/format';
import { BANDAS, type Banda } from '@/lib/types';

// Small horizontal histogram of AGEBs per banda. Bar widths are proportional
// to a share computed here purely for layout; the numbers shown are SQL counts.
export function ResumenBandas({ conteo, total }: { conteo: Record<Banda, number>; total: number }) {
  return (
    <div className="flex flex-col gap-1">
      {BANDAS.map((b) => (
        <div key={b} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-stone-600">{BANDA_LABEL[b]}</span>
          <div className="flex-1 h-3 bg-stone-100 rounded-sm overflow-hidden">
            <div className={`h-full ${BANDA_BAR_CLASS[b]}`} style={{ width: total ? `${(100 * conteo[b]) / total}%` : 0 }} />
          </div>
          <span className="w-12 text-right tabular-nums text-stone-700">{fmtInt(conteo[b])}</span>
        </div>
      ))}
    </div>
  );
}
