# denue-supply-gap

Para cada AGEB urbano de Ciudad de México y Nuevo León, y cada categoría SCIAN,
calcula cuántos establecimientos hay contra cuántos habría si ese AGEB tuviera
la tasa típica de su entidad. El cociente es el índice de suministro.

Datos: DENUE edición 2026-05 y Censo de Población y Vivienda 2020, ambos de
INEGI. 674,081 establecimientos, 5,198 AGEB urbanas, 4.4 millones de filas de
métrica precalculada.

---

## El problema

Dos preguntas, la misma tabla de gold leída por dos caminos:

- **Por categoría:** ¿en qué AGEB de Nuevo León faltan tiendas de abarrotes?
  Se fija la categoría y se ordenan los AGEB. Ruta `/explorar`.
- **Por área:** ¿qué le falta a este AGEB de Cumbres? Se fija el AGEB y se
  ordenan las categorías. Ruta `/ageb/[ageb_key]`.

Lo que mide es **oferta relativa**, no desempeño de negocios. DENUE no tiene
ingresos, tráfico ni rentabilidad, y el producto nunca los afirma.

---

## Glosario

Tres términos de INEGI que el resto del repo da por entendidos.

**DENUE**, Directorio Estadístico Nacional de Unidades Económicas. Un registro
de establecimientos activos, un renglón por establecimiento. Se usa la descarga
masiva, no la API: la API no regresa la clave de AGEB y sin ella el proyecto no
existe. Un renglón, ya limpio en `silver.establecimiento`:

```
clee          19039722514027141000000000U5
nombre        COMBITACOS
clase_id      722514        -> taquerías
estrato_id    1             -> "0 a 5 personas"
ageb_key      1903900014233
municipio_id  19039         -> Monterrey
```

**SCIAN**, Sistema de Clasificación Industrial de América del Norte. Clasifica
la actividad económica en cinco niveles anidados, donde el código de cada nivel
es prefijo del siguiente:

```
sector     46      Comercio al por menor
subsector  461     Comercio al por menor de abarrotes, alimentos, bebidas, hielo y tabaco
rama       4611    Comercio al por menor de abarrotes y alimentos
subrama    46111   Comercio al por menor en tiendas de abarrotes, ultramarinos y misceláneas
clase      461110  Comercio al por menor en tiendas de abarrotes, ultramarinos y misceláneas
```

La UI expone tres: sector, subsector y clase. `rama` y `subrama` existen en
silver para que la jerarquía cierre, pero no se muestran.

**AGEB**, Área Geoestadística Básica. La unidad territorial del Censo, un
conjunto de manzanas en zona urbana, 28 en la mediana de estas dos entidades.
Es el grano de todo el proyecto. La clave se arma
concatenando cuatro campos con ancho fijo, igual del lado del Censo que del lado
de DENUE:

```
1903900014233
19    entidad     Nuevo León
039   municipio   Monterrey
0001  localidad   Monterrey
4233  AGEB        3,015 habitantes, elegible (>= 500)
```

---

## Fuentes

| Fuente | Qué aporta | Vigencia | Filas en bronze |
|---|---|---|---|
| DENUE descarga masiva, entidades 09 y 19 | establecimientos, clase SCIAN, estrato, AGEB | edición 2026-05 | 674,081 |
| Censo 2020, AGEB y manzana urbana, 09 y 19 | población por AGEB (`POBTOT`) | 2020 | 148,857 |
| Estructura SCIAN 2023 (xlsx) | nombres oficiales de los cinco niveles | 2023 | 2,115 |

Las vigencias no coinciden. El índice compara oferta de 2026 contra población
de 2020, y eso aparece como nota al pie en cada vista de datos.

---

## El índice

Para un AGEB `a`, una categoría `s` y su entidad `e`:

```
tasa(s,e)      = establecimientos de s en e / población de e
esperado(a,s)  = población(a) × tasa(s,e)
índice(a,s)    = (n(a,s) + α) / (esperado(a,s) + α)         α = 1
```

Menor a 1 es sub-oferta, mayor a 1 es sobre-oferta. Es un cociente de
localización con suavizado.

**Variante comercial:** sustituye población por el total de establecimientos del
AGEB como proxy de demanda, `esperado_com = total_estab(a) × N(s,e) / N_total(e)`.
Es la lectura para lugares donde la población diurna y la residencial divergen.
Dentro de un mismo AGEB esta variante es suma cero por construcción: la suma de
esperados sobre todas las categorías es el propio total del AGEB. Compara la
**mezcla** del AGEB contra la mezcla de la entidad, no su nivel absoluto.

**Por qué α:** un AGEB que espera 0.2 cafeterías y tiene 1 marcaría 5.0 sin
suavizado. Con bases chicas α domina el resultado, a propósito.

**Por qué no una mediana:** para la mayoría de las clases el AGEB mediano tiene
cero establecimientos, así que una densidad mediana da cero y el índice divide
entre cero.

**Bases por entidad:** CDMX y Nuevo León se comparan cada una contra sí misma.
El comercio al por menor es 45 % de los establecimientos en CDMX y 35 % en NL.

**Regla de grano:** el índice de un sector se calcula con conteos a nivel
sector, nunca agregando los índices de sus clases.

### Bandas y confianza

| banda | índice |
|---|---|
| muy_bajo | < 0.5 |
| bajo | 0.5 a 0.8 |
| normal | 0.8 a 1.25 |
| alto | 1.25 a 2.0 |
| muy_alto | >= 2.0 |

Umbrales fijos sobre el índice, no percentiles: con percentiles siempre caería
10 % de los AGEB en `muy_bajo`, hubiera brechas reales o no. El percentil se
guarda aparte como contexto de ranking.

Una categoría es `confiable` en una entidad si tiene al menos 30
establecimientos ahí. De 2,035 combinaciones (categoría × entidad), 1,107 lo
son. Las demás se pintan en gris, sin banda, y nunca ordenan primero.

---

## Arquitectura

Medallion sobre Postgres 16. Cada capa tiene una regla que no se rompe.

| Capa | Qué contiene | Regla |
|---|---|---|
| `bronze` | cada columna del CSV como `text`, más `source_file` y `ingested_at` | nunca se edita. Si una regla de limpieza está mal, se reconstruye silver |
| `silver` | entidades limpias y tipadas con llaves foráneas: `establecimiento`, `ageb`, `municipio`, la jerarquía SCIAN, `estrato` | nunca se borra una fila por calidad. Se marca en `calidad_flags` y gold decide qué filtrar |
| `gold` | la métrica ya calculada: `conteo_ageb_scian`, `tasa_scian`, `indice_suministro`, más catálogos de apoyo | lo único que lee la app |

Las transformaciones son archivos `.sql` numerados que corren en orden:

```
00_schemas      los tres esquemas
10_bronze       DDL de bronze, idempotente
20..23_silver   SCIAN, estrato, geografía, establecimiento
30..35_gold     conteos, tasas, índice, catálogos
90_checks       invariantes. Si una falla, aborta la reconstrucción
```

Reconstrucción completa: 1 min 42 s. Los cargadores de bronze son idempotentes
por `source_file`, así que volver a correr todo nunca duplica ni borra datos ya
cargados.

### Los conteos incluyen los ceros

`30_gold_conteo.sql` hace un cross join de AGEB elegibles contra las categorías
presentes en su entidad, y un left join a los conteos reales. Sin esas filas en
cero el ranking de sub-oferta perdería justo los lugares que se están buscando:
un AGEB sin ninguna tienda de abarrotes simplemente no aparecería. Son 4.4
millones de filas y el 91 % son ceros explícitos.

### Del navegador a Postgres

```
  navegador
     │  GET /explorar?entidades=19&nivel=clase&scian=461110&...
     ▼
  Next.js (App Router, server component)
     │  parseFiltros(searchParams)  -> FiltrosExplorar
     │  explorarPorScian(f)
     ▼
  web/lib/queries.ts           SQL directo con postgres.js, sin ORM
     │  SELECT ... FROM gold.indice_suministro
     │  WHERE nivel_scian, scian_id, entidad_id, poblacion
     │  ORDER BY confiable DESC, indice ASC   LIMIT 25
     ▼
  Postgres  gold.indice_suministro  (índice por nivel_scian, scian_id, entidad_id, indice)
     │  25 filas
     ▼
  HTML renderizado en el servidor
```

Notas del camino:

- **Todo el estado vive en la URL:** entidades, nivel, categoría, demanda,
  orden, página y población mínima son `searchParams`. No hay estado de filtros
  en `useState`. Una URL copiada reproduce exactamente la misma vista.
- **Las páginas son server components:** llaman a las funciones de query
  directamente. El único componente cliente es el riel de filtros, que no tiene
  datos propios y solo empuja URLs nuevas.
- **La métrica nunca se calcula en request time:** índice, esperado, banda y
  percentil ya están en gold. La página sí agrega esas filas ya calculadas en
  SQL (mediana e histograma de bandas), pero no recalcula la métrica.
- **Ningún número se calcula en React:** los componentes solo formatean a
  `es-MX`. La única aritmética en un componente es el ancho de las barras del
  histograma y el número de renglón.
- **La app nunca toca `silver.establecimiento`:** lee siete tablas de gold más
  `silver.ageb`, `silver.municipio` y `silver.entidad`. Ningún dato a nivel
  establecimiento, y por lo tanto ningún teléfono ni correo, llega al navegador.

Una consulta de `/explorar` tarda 33 ms.

---

## Invariantes

`90_checks.sql` corre al final de toda reconstrucción, incluso de una parcial
por prefijo, y aborta si algo se rompe:

```
1/8 identidad de tasas: sum(esperado) = sum(n_estab) en los 2035 nodos
2/8 filas en cero presentes: los 4362 AGEB elegibles tienen fila en cada nodo
3/8 conteos cuadran con silver en los tres granos: 624369 establecimientos elegibles
4/8 join DENUE -> AGEB: peor entidad 98.71 %
5/8 nada se borro por calidad: bronze 674081 -> silver 674081
6/8 cada nodo de conteo tiene su fila de tasa
7/8 los 5 AGEB x clase curados siguen resolviendo
8/8 cordura: Polanco sobre-ofertado en restaurantes (indice 2.5932)
```

El primero es el que importa: si la suma de esperados no iguala la suma de
observados para cada nodo, el join de tasas está mal y todo lo demás es ruido.

No hay tests unitarios. Las invariantes están en SQL porque los errores de este
proyecto son de datos, no de funciones puras.

---

## Calidad de datos

Ningún registro se borra. Se marca en `silver.establecimiento.calidad_flags`.

| marca | volumen | qué significa |
|---|---|---|
| `clee_inconsistente` | 13.6 % | la clave CLEE no concuerda con las columnas. 96.5 % de esos casos difieren solo en la clase SCIAN, es reclasificación posterior a la creación de la clave. Se confía en las columnas, no en la clave |
| `posible_duplicado` | 3.4 % | mismo nombre normalizado a menos de 50 m. Se marca, nunca se fusiona |
| `sin_ageb` | 0.6 % | no une con un AGEB urbano del Censo. Concentrado en municipios periféricos |
| `coord_sospechosa` | 8 registros | coordenadas fuera del bounding box de su entidad |

El join de DENUE contra AGEB del Censo es 99.75 % en CDMX y 98.71 % en Nuevo
León.

---

## Límites conocidos

1. **Sin ingresos, tráfico ni rentabilidad.** DENUE no los tiene.
2. **Gravedad comercial.** La población residencial representa mal la demanda
   donde la población diurna es muy distinta. Para eso existe la variante
   comercial, con la advertencia de suma cero de arriba.
3. **Sustitución entre clases.** SCIAN separa sustitutos cercanos en clases
   distintas. El AGEB `1903900015157` tiene cero tiendas de abarrotes (461110,
   índice 0.03) y cuatro minisúper (462112, índice 1.08). La demanda está
   atendida, clasificada en otro lado. Por eso el índice solo vale en el grano
   en que se calculó y por eso existe el selector de nivel.
4. **Vigencias distintas.** Oferta de 2026 contra población de 2020.
5. **El estrato es un rango,** no una plantilla. Nunca se muestran estimaciones
   puntuales de empleo.
6. **Solo AGEB urbanas y con al menos 500 habitantes.** Quedan fuera 836 AGEB,
   que son el 2 % de la población de Nuevo León y el 0.2 % de la de CDMX. De los
   674,081 establecimientos, 624,369 (92.6 %) entran al cálculo.

---

## Lo que no está construido

- **Afinidad entre categorías** (`gold.afinidad_pares`, lift por co-presencia)
  quedó especificada y sin construir.
- **Tests unitarios**, por la razón de arriba.
- **PostGIS.** DENUE ya trae la clave de AGEB, así que la métrica son `GROUP BY`
  y no hace falta geometría. Se necesitaría para vecindad o isócronas.
- **Más entidades.** El pipeline no tiene nada específico de 09 y 19 salvo los
  bounding boxes de `silver.entidad_bbox` y la lista de archivos a descargar.

---

## Correr el proyecto

Requiere Docker y Node 22+. Pasos completos, incluidas las descargas, en
[DEMO.md](DEMO.md). La especificación y el porqué de cada decisión están en
[PROYECTO.md](PROYECTO.md).

```bash
docker compose up -d
```

```bash
npm run sql
```

```bash
npm --prefix web run build && npm --prefix web start
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run sql -- 3` | reconstruye solo gold. Las invariantes corren de todos modos |
| `npm run sql -- 90_` | corre solo las invariantes e imprime las ocho |
| `npm --prefix web run check:queries` | ejecuta las funciones de query y compara una fila contra un cálculo a mano |
| `npm run load:bronze` | recarga los CSV a bronze, idempotente por `source_file` |
