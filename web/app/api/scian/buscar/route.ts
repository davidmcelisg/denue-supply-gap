import type { NextRequest } from 'next/server';
import { parseNivel } from '@/lib/params';
import { buscarScian } from '@/lib/queries';

// Typeahead endpoint. Shape: ResultadoBusqueda[] (see lib/types.ts).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const nivelRaw = request.nextUrl.searchParams.get('nivel');
  const nivel = nivelRaw ? parseNivel(nivelRaw) : undefined;
  const res = await buscarScian(q, nivel);
  return Response.json(res, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
