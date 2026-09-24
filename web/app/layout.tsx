import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brechas de oferta · DENUE',
  description: 'Categorías de negocio sobre- y sub-ofertadas por AGEB en CDMX y Nuevo León.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-stone-900">
        <header className="border-b border-stone-200">
          <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6 text-sm">
            <Link href="/" className="font-semibold tracking-tight">Brechas de oferta</Link>
            <Link href="/explorar" className="text-stone-600 hover:text-stone-900">Explorar por categoría</Link>
            <Link href="/metodologia" className="text-stone-600 hover:text-stone-900">Metodología</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-stone-200 text-xs text-stone-500">
          <div className="mx-auto max-w-6xl px-4 py-3">
            Fuente: INEGI, DENUE y Censo de Población y Vivienda 2020. Oferta relativa, no desempeño de negocios.
          </div>
        </footer>
      </body>
    </html>
  );
}
