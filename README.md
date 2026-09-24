# denue-supply-gap

¿Dónde en NL y CDMX cada categoría de negocio está poco o sobre explotada
relativa a la comparación dentro de su estado?

---

## El problema

Para cada zona y cada categoría de negocio se compara cuántos establecimientos
hay contra cuántos habría si esa zona se comportara como el promedio de su
estado. El resultado es un solo número: por debajo de 1 hay menos de lo típico,
por encima de 1 hay más.

Aplica a las 1,200 categorías del catálogo, desde tiendas de abarrotes hasta
bufetes jurídicos, en las 4,362 zonas evaluadas. Nada en el cálculo es
específico de un giro.

La misma tabla se lee por dos caminos, que son las dos vistas de la app:

- **Por categoría:** se fija una categoría y se ordenan las zonas, de la que
  menos tiene a la que más. Ruta `/explorar`.
- **Por zona:** se fija una zona y se ordenan las categorías. Ruta
  `/ageb/[ageb_key]`.

Lo que mide es **oferta relativa**, no desempeño de negocios. La fuente no tiene
ingresos, tráfico ni rentabilidad, y el producto nunca los afirma.

---

## Glosario

**DENUE** (Directorio Estadístico Nacional de Unidades Económicas): es una base
de datos oficial creada por el INEGI que contiene información detallada sobre
millones de negocios y establecimientos activos en México.

- Para consumir estos datos se usa la descarga masiva en lugar de llamar a la API
  (ya que esta no regresa la clave AGEB).
- Ejemplo: `{nombre: "COMBITACOS", clase_id: 722514 ("taquerías"), ageb_key: 1903900014233...}`

**SCIAN** (Sistema de Clasificación Industrial de América del Norte): el catálogo
oficial utilizado en México para clasificar las actividades económicas de los
negocios y empresas mediante códigos numéricos estandarizados. Son cinco niveles
anidados, donde el código de cada nivel es prefijo del siguiente:

```
sector     46      Comercio al por menor
subsector  461     Comercio al por menor de abarrotes, alimentos, bebidas, hielo y tabaco
rama       4611    Comercio al por menor de abarrotes y alimentos
subrama    46111   Comercio al por menor en tiendas de abarrotes, ultramarinos y misceláneas
clase      461110  Comercio al por menor en tiendas de abarrotes, ultramarinos y misceláneas
```

La UI expone tres: sector, subsector y clase. `rama` y `subrama` existen en
nuestra categoría de datos silver para que la jerarquía cierre, pero no se
utilizan.

**AGEB** (Área Geoestadística Básica): unidad territorial usada por el INEGI para
organizar y presentar información estadística de los censos en el país. En este
proyecto se usa como ID concatenando cuatro campos con ancho fijo, igual del lado
del Censo que del lado de DENUE.

- Ejemplo: `{entidad: 19 (NL), municipio: 039 (Monterrey), localidad: 0001 (Monterrey), AGEB: 4233}`
- ID generado con ejemplo anterior: `1903900014233`

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

## Arquitectura

Arquitectura Medallion sobre Postgres 16. Cada capa tiene una regla que no se rompe.

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

### Invariantes

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

La primera es la que importa: si la suma de esperados no iguala la suma de
observados para cada categoría, el join de tasas está mal y todo lo demás es
ruido.

No hay tests unitarios. Las invariantes están en SQL porque los errores de este
proyecto son de datos, no de funciones puras.

### Los conteos incluyen los ceros

`30_gold_conteo.sql` hace un cross join de AGEB elegibles contra las categorías
presentes en su entidad, y un left join a los conteos reales. Sin esas filas en
cero el ranking de sub-oferta perdería justo los lugares que se están buscando:
un AGEB sin ninguna tienda de abarrotes simplemente no aparecería. Son 4.4
millones de filas y el 91 % son ceros explícitos.

### Del navegador a Postgres

No hay API intermedia ni fetch desde el cliente. La página es un server
component: Next.js consulta Postgres en el servidor y hasta entonces arma el
HTML, que es lo único que viaja al navegador.

```
  navegador                Next.js (servidor)              Postgres
      │                           │                            │
      │  1. pide una página       │                            │
      │──────────────────────────>│                            │
      │                           │  2. SELECT sobre gold      │
      │                           │───────────────────────────>│
      │                           │                            │
      │                           │  3. 25 filas ya calculadas │
      │                           │<───────────────────────────│
      │                           │                            │
      │  4. HTML ya renderizado   │  (arma el HTML con ellas)  │
      │<──────────────────────────│                            │
      │                           │                            │
```

La consulta del paso 2 es SQL directo con `postgres.js`, sin ORM, contra
`gold.indice_suministro`. Tarda 33 ms.

---

## Calidad de datos

Cuando un registro de la fuente tiene un problema no se borra: se le pone una
marca en `silver.establecimiento.calidad_flags` y sigue en la tabla. Las marcas
son advertencias sobre el dato de origen, no hallazgos del producto ni errores
del pipeline, y ninguna de las cuatro impide que el registro cuente en la
métrica. Sirven para poder auditar después de dónde viene un número raro.

Estos son los volúmenes actuales:

| marca | volumen | qué la dispara |
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
   donde la población diurna es muy distinta (Santa Fe, Centro Histórico, San
   Pedro). Para eso la app permite cambiar la base de comparación a la actividad
   comercial de la zona en lugar de sus habitantes. Esa segunda lectura es suma
   cero dentro de una zona: compara su mezcla de giros contra la mezcla del
   estado, no su nivel absoluto.
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
