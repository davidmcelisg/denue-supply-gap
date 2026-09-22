'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
      <p className="font-medium text-red-800">No se pudo cargar este AGEB.</p>
      <p className="text-red-700 mt-1 font-mono text-xs">{error.message}</p>
      <button onClick={reset} className="mt-3 rounded border border-red-300 px-2 py-1">Reintentar</button>
    </div>
  );
}
