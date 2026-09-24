// Phase 4 acceptance: run each query function and compare one row of
// explorarPorScian against a hand computation from gold.conteo_ageb_scian
// and gold.tasa_scian.  `npm run check:queries`
import { sql } from '../lib/db';
import { buscarScian, detallarAgeb, explorarPorScian, obtenerAgeb } from '../lib/queries';

const t0 = performance.now();
const r = await explorarPorScian({
  entidades: ['09', '19'], nivel: 'clase', scianId: '722515',
  demanda: 'poblacion', orden: 'indice_asc', pagina: 1, minPob: 500,
});
console.log(`explorarPorScian: ${(performance.now() - t0).toFixed(0)} ms`);
console.log('  total:', r.total, '| resumen:', r.resumen, '| contexto:', r.contexto);
console.log('  fila[0]:', r.filas[0]);
console.log('  filas:', r.filas.length, '| all confiable first?', r.filas.every((f, i, a) => i === 0 || !(f.confiable && !a[i - 1].confiable)));

// hand computation for fila[0]: indice = (n + α) / (pob * N/P + α)
const f0 = r.filas[0];
const [{ n_estab, poblacion }] = await sql`SELECT n_estab, poblacion FROM gold.conteo_ageb_scian WHERE ageb_key = ${f0.agebKey} AND nivel_scian = 'clase' AND scian_id = '722515'`;
const [{ n_total, pob_total }] = await sql`SELECT n_total, pob_total FROM gold.tasa_scian WHERE entidad_id = ${f0.agebKey.slice(0, 2)} AND nivel_scian = 'clase' AND scian_id = '722515'`;
const esperado = poblacion * (n_total / pob_total);
const indice = (n_estab + r.contexto.alpha) / (esperado + r.contexto.alpha);
console.log(`  hand: n=${n_estab} pob=${poblacion} N=${n_total} P=${pob_total} → esperado=${esperado.toFixed(4)} indice=${indice.toFixed(4)}`);
console.log(`  gold: n=${f0.nEstab} pob=${f0.poblacion} → esperado=${f0.esperado} indice=${f0.indice}`);
console.log('  MATCH:', Math.abs(esperado - f0.esperado) < 0.001 && Math.abs(indice - f0.indice) < 0.001 && n_estab === f0.nEstab);

const rc = await explorarPorScian({ entidades: ['19'], nivel: 'sector', scianId: '72', demanda: 'comercial', orden: 'indice_desc', pagina: 2, minPob: 2000 });
console.log('\nexplorarPorScian (comercial, sector 72, NL, page 2, minPob 2000): total', rc.total, '| fila[0]:', rc.filas[0]?.agebKey, rc.filas[0]?.indice, rc.filas[0]?.banda);

const d = await detallarAgeb('1903900014233', 'poblacion', 'clase');
console.log(`\ndetallarAgeb (Cumbres, clase): ${d.filas.length} filas de ${d.total} categorías | first 3:`, d.filas.slice(0, 3).map((x) => `${x.scianId} ${x.scianNombre.slice(0, 30)} n=${x.nEstab} esp=${x.esperado} idx=${x.indice} ${x.banda} conf=${x.confiable}`));
const dTodas = await detallarAgeb('1903900014233', 'poblacion', 'clase', true);
console.log('  todas=true devuelve el total completo:', dTodas.filas.length === dTodas.total, `(${dTodas.filas.length})`);
console.log('  obtenerAgeb:', await obtenerAgeb('1903900014233'));

console.log('\nbuscarScian("cafeter"):', await buscarScian('cafeter'));
console.log('buscarScian("722", clase):', (await buscarScian('722', 'clase')).slice(0, 3));
console.log('buscarScian("farmacia"):', (await buscarScian('farmacia')).map((x) => `${x.nivel} ${x.scianId} ${x.scianNombre}`));

await sql.end();
