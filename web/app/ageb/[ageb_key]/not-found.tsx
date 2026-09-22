import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="text-sm text-stone-600">
      <p>No existe un AGEB urbano con esa clave.</p>
      <Link href="/explorar" className="underline">Volver a explorar</Link>
    </div>
  );
}
