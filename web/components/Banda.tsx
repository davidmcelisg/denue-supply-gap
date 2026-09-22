import { BANDA_CLASS, BANDA_LABEL } from '@/lib/format';
import type { Banda } from '@/lib/types';

export function BandaBadge({ banda }: { banda: Banda }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${BANDA_CLASS[banda]}`}>
      {BANDA_LABEL[banda]}
    </span>
  );
}
