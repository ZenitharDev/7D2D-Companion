// Modo DISCOVERY: no asume nada sobre los nombres exactos de propiedades del
// juego instalado. Escanea items.xml buscando candidatos a pieza de armadura
// con heurísticas amplias, y vuelca sus propiedades/efectos crudos para que
// puedas (o me pases el resultado para que yo) ajustar
// scripts/extract/mapping.json en base a los nombres reales de tu versión.
//
// Uso:
//   npx tsx scripts/extract/scan.ts --config "C:\...\7 Days To Die\Data\Config"
//
// Salida: imprime un resumen en consola y escribe un reporte completo en
// scripts/extract/output/scan-report.json

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllPassiveEffects, getProperties, getProperty, loadXml, toArray } from './xml.js';
import type { ItemsXmlRoot, XmlItem } from './xml.js';
import { buildLocalizationMap } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith('--')) {
      const key = argv[i]!.slice(2);
      const value = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
      out[key] = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const configDir = args.config;

if (!configDir) {
  console.error('Falta --config <ruta a la carpeta Data/Config de 7 Days to Die>.');
  console.error('Ejemplo: npx tsx scripts/extract/scan.ts --config "C:\\Program Files (x86)\\Steam\\steamapps\\common\\7 Days To Die\\Data\\Config"');
  process.exit(1);
}

const itemsPath = path.join(configDir, 'items.xml');
if (!existsSync(itemsPath)) {
  console.error(`No se encontró items.xml en ${itemsPath}. Verificá la ruta (debe ser la carpeta Data/Config).`);
  process.exit(1);
}

const itemsRoot = loadXml<ItemsXmlRoot>(itemsPath);
const allItems = toArray(itemsRoot.items?.item);
console.log(`items.xml cargado: ${allItems.length} items totales.`);

let localization: Map<string, string> | null = null;
const locPath = path.join(configDir, 'Localization.txt');
if (existsSync(locPath)) {
  try {
    localization = buildLocalizationMap(readFileSync(locPath, 'utf-8'));
    console.log(`Localization.txt cargado: ${localization.size} claves.`);
  } catch (err) {
    console.warn(`No se pudo parsear Localization.txt: ${(err as Error).message}`);
  }
} else {
  console.warn(`No se encontró Localization.txt en ${configDir} (opcional, se usa para nombres legibles).`);
}

// Heurística amplia: candidato a armadura si...
function isArmorCandidate(item: XmlItem): boolean {
  const name = item.name ?? '';
  const props = getProperties(item);
  const cls = props.find((p) => p.name === 'Class')?.value ?? '';
  const tags = props.find((p) => p.name === 'Tags')?.value ?? '';
  const equipSlot = props.find((p) => p.name === 'EquipSlot' || p.name === 'HoldType')?.value ?? '';

  return (
    /armor/i.test(name) ||
    /armor/i.test(cls) ||
    /armor/i.test(tags) ||
    /head|chest|glove|hand|boot|feet|leg/i.test(equipSlot)
  );
}

const candidates = allItems.filter(isArmorCandidate);
console.log(`Candidatos a pieza de armadura (heurística amplia): ${candidates.length}`);

// Agrupa por "prefijo de set" adivinado: nombre sin el token de slot ni el tier final.
const SLOT_TOKEN_RE = /(Head|Helmet|Chest|Vest|Upper|Gloves|Hands|Boots|Feet|Legs)/i;
const TIER_SUFFIX_RE = /T?[1-6]$/;

function guessSetPrefix(name: string): string {
  return name.replace(SLOT_TOKEN_RE, '').replace(TIER_SUFFIX_RE, '');
}

interface ScanEntry {
  name: string;
  displayName?: string;
  guessedSetPrefix: string;
  properties: Record<string, string>;
  passiveEffects: Array<{ name: string; operation?: string; value?: string; tags?: string }>;
}

const report: ScanEntry[] = candidates.map((item) => {
  const properties: Record<string, string> = {};
  for (const p of getProperties(item)) {
    if (p.value !== undefined) properties[p.name] = p.value;
  }
  return {
    name: item.name,
    displayName: localization?.get(item.name) ?? localization?.get(`${item.name}Desc`) ?? undefined,
    guessedSetPrefix: guessSetPrefix(item.name),
    properties,
    passiveEffects: getAllPassiveEffects(item).map((e) => ({
      name: e.name,
      operation: e.operation,
      value: e.value,
      tags: e.tags,
    })),
  };
});

// Agrupar para el resumen de consola.
const bySetPrefix = new Map<string, ScanEntry[]>();
for (const entry of report) {
  const key = entry.guessedSetPrefix;
  if (!bySetPrefix.has(key)) bySetPrefix.set(key, []);
  bySetPrefix.get(key)!.push(entry);
}

console.log('\nGrupos detectados (prefijo adivinado -> cantidad de items):');
for (const [prefix, entries] of [...bySetPrefix.entries()].sort()) {
  console.log(`  ${prefix || '(sin prefijo claro)'}: ${entries.length} items -> ej. ${entries[0]!.name}`);
}

if (report.length > 0) {
  console.log('\nEjemplo de item completo (para ver qué nombres de propiedad/efecto usa tu versión):');
  console.log(JSON.stringify(report[0], null, 2));
}

const outDir = path.join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'scan-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

console.log(`\nReporte completo (${report.length} items) escrito en: ${outPath}`);
console.log('Siguiente paso: revisá ese archivo (o pegámelo) y ajustá scripts/extract/mapping.json con los nombres reales antes de correr "npm run extract".');
