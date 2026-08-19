# 7 Days to Die — Armor Build Calculator

Módulo en TypeScript para calcular y comparar builds de armadura (4 slots:
Helmet, Chest, Gloves, Boots) para 7 Days to Die.

`src/data/armorSets.json` contiene los **15 sets reales** del juego,
extraídos directamente de una instalación real (`Data/Config/items.xml`,
`recipes.xml`, `buffs.xml`, `Localization.csv`) con el extractor incluido —
no son datos inventados. Ver [Cómo representa el juego las armaduras](#cómo-representa-el-juego-las-armaduras-en-la-realidad)
más abajo para el detalle de qué se pudo verificar 1:1 contra el XML y qué
quedó como una inferencia razonable (marcada explícitamente).

## Estructura

```
src/
  types.ts                 Modelo de datos (TypeScript) — fuente de verdad de tipos
  data/
    armor-schema.json      JSON Schema (draft-07) formal del modelo
    armorSets.json          Los 15 sets reales, extraídos del juego
    loadArmorSets.ts        Loader (único punto que conoce la ruta del JSON)
  lib/
    expand.ts               Expande progression -> stats concretos por Tier 1-6
    ArmorBuildCalculator.ts Clase principal: calculate() y compare()
  index.ts                  Demo ejecutable
scripts/
  generate-armor-data.ts    Generador de datos PLACEHOLDER (fallback si no tenés el juego instalado)
  extract/                  Extractor de datos reales — ver más abajo
tests/
  ArmorBuildCalculator.test.ts
```

## Cómo representa el juego las armaduras (en la realidad)

Esto es lo que confirmamos leyendo los XML reales, no una suposición:

- Hay **un item por (set, slot)** — no un item distinto por Tier
  (`armorPreacherHelmet`, no `armorPreacherHelmetT3`). El "Tier" es la
  **Quality** (1-6) de ese mismo item.
- Las 4 piezas de un set comparten la propiedad `ArmorGroup` (ej.
  `"groupPreacher"`) — es la clave real de agrupación, no el nombre del item.
- El **armor rating** sale de `PhysicalDamageResist`: un rango `[valor en
  Q1, valor en Q6]` interpolado linealmente entre calidades.
- La **movilidad** (`Mobility`) y el **gasto de estamina**
  (`StaminaChangeOT`) son un valor FIJO por pieza — no empeoran al craftear
  una versión de mayor calidad de la misma pieza. Confirmado: Light = 0,
  Medium ≈ -5%, Heavy ≈ -7.5%, pero es un dato por pieza, no una fórmula por
  clase.
- Cada pieza puede tener **0, 1 o varios pasivos propios** (`passives[]`),
  cada uno como una lista explícita de 6 valores (uno por calidad) o un
  rango de 2 (interpolado). Ej.: Preacher Gloves trae `EntityDamage`
  +10%→+60%; Assassin Outfit trae 4 pasivos distintos (ruido, luz,
  velocidad al agachar, tiempo de búsqueda enemiga).
- El **Set Bonus** vive en `buffs.xml` como un buff separado
  (`buff{Set}SetBonus`) con una condición `ArmorGroupCount == 4` para
  activarse y `ArmorGroupLowestQuality` para determinar el nivel — **exactamente**
  "las 4 piezas puestas, nivel = la de menor calidad", tal cual lo pedías.
  El texto del bonus sale del mismo Localization (`{cvar(...)}` reemplazado
  por el valor real de cada nivel).
- Los **materiales de crafteo** por Tier salen de `CraftingIngredientCount`
  en `recipes.xml`: cada recurso agrega una cantidad extra a partir de
  cierta Quality (ej. Forged Iron se suma recién desde Tier 3). ⚠️ La regla
  exacta de interpolación entre los niveles definidos no está confirmada al
  100% contra el motor del juego — usamos "sostener el último valor
  definido" (función escalón), que es la lectura más razonable del patrón
  de datos, pero es una inferencia, no un hecho verificado. Ver
  `stepLookup()` en [extract-armor.ts](scripts/extract/extract-armor.ts).

### Los 15 sets reales

El roster real (los únicos 15 `ArmorGroup` que tienen su propio buff
`SetBonus` en `buffs.xml` — el resto de los ~29 grupos con 4 piezas son
reskins cosméticos sin bonus propio):

**Assassin, Athletic, Biker, Commando, Enforcer, Farmer, Lumberjack,
Miner, Nerd, Nomad, Preacher, Raider, Ranger, Rogue, Scavenger.**

## Modelo de datos

`StatProgression` admite dos formas:

```ts
{ kind: 'linear', base: 10, growth: 6.5 }              // placeholder a mano
{ kind: 'explicit', values: { 1: 8, 2: 8.9, ..., 6: 12.3 } } // extraído del XML real
```

`ArmorPieceData.passives` es un **array** (no todas las piezas tienen un
pasivo propio, y algunas tienen varios). `ArmorSetData.setBonus.levels`
define los 6 niveles explícitamente.

## `ArmorBuildCalculator`

```ts
import { ArmorBuildCalculator } from './src/lib/ArmorBuildCalculator.js';
import { loadArmorSets } from './src/data/loadArmorSets.js';

const calculator = new ArmorBuildCalculator(loadArmorSets());

const result = calculator.calculate({
  helmet: { setId: 'raider', tier: 4 },
  chest:  { setId: 'raider', tier: 4 },
  gloves: { setId: 'raider', tier: 4 },
  boots:  { setId: 'raider', tier: 2 }, // pieza de menor calidad
});
```

`result: ArmorBuildResult` incluye:

- `totalArmorRating`: suma de armor rating de las piezas equipadas.
- `penalties`: `movementPenaltyPct`, `staminaPenaltyPct` (fijos por pieza,
  sumados), y `noiseIndex`/`noiseLabel` derivados del pasivo real
  `NoiseMultiplier` cuando la pieza lo define (si ninguna lo define, 0).
- `passives`: lista de todos los pasivos de las piezas equipadas (slot,
  set, tier, stat, valor, tags).
- `setBonuses`: por cada set presente en el build, si está **activo** (las
  4 piezas son de ese set), en qué **nivel** (= tier de la pieza de MENOR
  calidad equipada) y el efecto concreto de ese nivel.
- `materials`: lista consolidada (sumada por `itemId`) de todos los
  materiales de crafteo de las piezas equipadas en su tier elegido.
- `warnings`: avisos no bloqueantes (set desconocido, slot sin datos,
  tier incompleto, etc.) — el cálculo nunca crashea por datos faltantes.

También expone `compare(buildA, buildB)` para diffear dos builds.

## Íconos reales del juego

`Data/ItemIcons/` en la instalación del juego trae un PNG (160x160) por
cada item, nombrado exactamente igual que su `itemId`
(`armorPreacherHelmet.png`, `resourceForgedIron.png`, ...). Son los
íconos reales del juego, no un set genérico.

```bash
npx tsx scripts/extract/copy-icons.ts --icons "C:\Program Files (x86)\Steam\steamapps\common\7 Days To Die\Data\ItemIcons"
```

Recorre `armorSets.json`, junta los `itemId` que realmente usamos (piezas +
materiales de crafteo) y copia solo esos ~66 PNG a `public/icons/`
(2-3 MB) para que la web los sirva directo. Volvé a correrlo si
`extract-armor.ts` agrega sets/materiales nuevos. Si falta un ícono
puntual, `ItemIcon.tsx` muestra un placeholder neutro en vez de romper.

⚠️ Son assets con copyright de The Fun Pimps. Se publican junto con el
resto del sitio (decisión consciente, no accidental — es la misma
práctica que usan la mayoría de las calculadoras/wikis de fans para este
tipo de juegos). `public/icons/` está commiteado al repo por eso mismo; si
en algún momento preferís no publicarlos más, basta con volver a
gitignorearlo y quitar la carpeta del build.

## Interfaz web

**Live: https://zenithardev.github.io/7D2D-Companion/**

```bash
npm run dev:web    # levanta Vite en http://localhost:5173
```

SPA en React (`src/web/`) que usa `ArmorBuildCalculator` directamente en el
browser (sin backend). Por cada slot (Helmet/Chest/Gloves/Boots) elegís un
set y su Tier (1-6) con el control de calidad (coloreado con la misma
rampa Junk→Legendary del juego); el panel de resultados se recalcula en
vivo: Armor Rating, penalizaciones, Set Bonus (activo/inactivo y nivel),
pasivos y materiales de crafteo consolidados. Un selector rápido arriba
permite equipar un set completo a Tier 6 de una.

`npm run build:web` genera el build estático en `dist-web/` (separado del
`dist/` de la librería).

### Deploy a GitHub Pages

Ya está configurado: `.github/workflows/deploy.yml` corre `npm run build:web`
y publica `dist-web/` en cada push a `main`. `vite.config.ts` fija
`base: '/7D2D-Companion/'` en build (GitHub Pages sirve el sitio bajo ese
prefijo, no en la raíz del dominio) — si el repo cambia de nombre, hay que
actualizar ese string.

**Paso manual único** (no se puede hacer por git): en GitHub, andá a
`Settings → Pages → Build and deployment → Source` y elegí **GitHub
Actions**. Sin eso el workflow corre pero el deploy final falla porque
Pages no está habilitado en el repo.

Los íconos reales del juego (`public/icons/`, ~2.4 MB) se publican junto
con el resto del sitio — ver la sección de arriba sobre esa decisión.

## Uso (librería / CLI)

```bash
npm install
npm run dev        # corre src/index.ts con ejemplos (tsx)
npm run typecheck  # tsc --noEmit (lib + scripts + web)
npm test           # vitest
npm run build      # compila la librería a dist/
```

## Re-extraer datos cuando el juego actualiza

```bash
npx tsx scripts/extract/extract-armor.ts --config "C:\Program Files (x86)\Steam\steamapps\common\7 Days To Die\Data\Config" --gameVersion 1.2.0
```

Esto reescribe `src/data/armorSets.json` con datos frescos y escribe
`scripts/extract/output/extract-report.json` con cualquier aviso (item
duplicado, receta no encontrada, nivel de Set Bonus faltante, etc.).

```
scripts/extract/
  scan.ts               Modo "discovery": escanea items.xml con heurísticas amplias y vuelca un reporte crudo — útil si el juego cambia de convención y hay que re-mapear
  extract-armor.ts      Extracción real usando mapping.json
  mapping.default.json  Mapeo verificado: 15 sets -> ArmorGroup + buff de Set Bonus
  csv.ts, xml.ts         Utilidades de parseo (CSV de Localization, XML genérico)
  output/                 scan-report.json / extract-report.json (se regeneran en cada run)
```

**`mapping.json`** (se crea copiando `mapping.default.json` la primera vez)
es lo único que hay que tocar si un update del juego cambia nombres de
propiedades o agrega/saca sets — el código de `extract-armor.ts` no debería
necesitar cambios para eso. Si un update SÍ cambia la convención de forma
más profunda (ej. deja de usar `ArmorGroup`, o `PhysicalDamageResist` pasa
a llamarse distinto), corré primero `npx tsx scripts/extract/scan.ts
--config "..."` para ver la estructura nueva antes de tocar el mapping.

**Garantía de seguridad:** el extractor nunca deja un set peor de lo que
estaba. Si no puede resolver algo con confianza, conserva el valor anterior
de `armorSets.json` para ese campo/set y lo reporta como warning en vez de
sobrescribir con `0` o inventar un número. Además detecta ítems duplicados
para el mismo slot (ej. variantes "Demo"/dev que a veces comparten
`ArmorGroup`) y avisa en vez de pisar el dato bueno en silencio.

## Generador de placeholders (fallback sin el juego instalado)

`scripts/generate-armor-data.ts` sigue existiendo por si alguien quiere
correr el proyecto sin tener 7 Days to Die instalado: genera datos
ilustrativos (no reales) con la forma correcta del schema. `armorSets.json`
ya viene con datos reales extraídos, así que normalmente no hace falta
correrlo — solo como referencia de la forma del schema o para prototipar.

```bash
npx tsx scripts/generate-armor-data.ts
```
