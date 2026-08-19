// Copia los íconos reales del juego (Data/ItemIcons/*.png, uno por itemId)
// para las piezas de armadura y materiales que efectivamente usa
// armorSets.json, a public/icons/ para que la web los sirva directo.
//
// Uso:
//   npx tsx scripts/extract/copy-icons.ts --icons "C:\...\7 Days To Die\Data\ItemIcons"
//
// Solo copia lo que hace falta (no las ~5000 imágenes del juego): recorre
// armorSets.json juntando itemId de cada pieza y de cada material, y copia
// "<itemId>.png" si existe. Re-ejecutable: no rompe nada si falta un ícono,
// solo lo reporta.

import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArmorSetData } from '../../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

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
const iconsDir = args.icons;
if (!iconsDir) {
  console.error('Falta --icons <ruta a Data/ItemIcons de 7 Days to Die>.');
  console.error('Ejemplo: npx tsx scripts/extract/copy-icons.ts --icons "C:\\...\\7 Days To Die\\Data\\ItemIcons"');
  process.exit(1);
}
if (!existsSync(iconsDir)) {
  console.error(`No se encontró la carpeta: ${iconsDir}`);
  process.exit(1);
}

const armorSetsPath = path.join(REPO_ROOT, 'src', 'data', 'armorSets.json');
const sets: ArmorSetData[] = JSON.parse(readFileSync(armorSetsPath, 'utf-8'));

const neededIds = new Set<string>();
for (const set of sets) {
  for (const slot of Object.keys(set.pieces) as (keyof typeof set.pieces)[]) {
    const piece = set.pieces[slot];
    if (!piece) continue;
    neededIds.add(piece.itemId);
    for (const tier of Object.keys(piece.tierMaterials)) {
      for (const mat of piece.tierMaterials[Number(tier) as 1 | 2 | 3 | 4 | 5 | 6]) {
        neededIds.add(mat.itemId);
      }
    }
  }
}

const outDir = path.join(REPO_ROOT, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

let copied = 0;
const missing: string[] = [];

for (const id of neededIds) {
  const src = path.join(iconsDir, `${id}.png`);
  if (!existsSync(src)) {
    missing.push(id);
    continue;
  }
  copyFileSync(src, path.join(outDir, `${id}.png`));
  copied++;
}

console.log(`Copiados ${copied}/${neededIds.size} íconos a ${outDir}`);
if (missing.length > 0) {
  console.log(`Faltantes (${missing.length}), la UI usará un placeholder para estos:`);
  for (const id of missing) console.log(`  - ${id}`);
}
