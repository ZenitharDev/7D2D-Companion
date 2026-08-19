// Genera src/data/armorSets.json a partir de tablas compactas.
// Ejecutar con: npx tsx scripts/generate-armor-data.ts
//
// IMPORTANTE: los valores numéricos (armor rating, penalizaciones, materiales,
// stats de Set Bonus) son PLACEHOLDERS ilustrativos que siguen la proporción
// esperada del juego (Light < Medium < Heavy, chest > resto, etc.), NO son
// una extracción literal de Config/items.xml de la v3.1.0. Antes de usarlos
// para balancear un build real, ajusta "base"/"growth" y `tierMaterials`
// contra los XML del juego. La estructura (schema) sí es estable y no
// necesita tocarse para corregir los números.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ArmorSetData, ArmorSlot, CraftingMaterial, Tier } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SLOT_MULTIPLIER: Record<ArmorSlot, number> = {
  chest: 1.4,
  helmet: 1.0,
  gloves: 0.8,
  boots: 0.9,
};

function scaleMaterials(
  table: Record<Tier, CraftingMaterial[]>,
  slot: ArmorSlot,
): Record<Tier, CraftingMaterial[]> {
  const mult = SLOT_MULTIPLIER[slot];
  const out = {} as Record<Tier, CraftingMaterial[]>;
  for (const tierStr of Object.keys(table)) {
    const tier = Number(tierStr) as Tier;
    out[tier] = table[tier]!.map((m) => ({ ...m, quantity: Math.max(1, Math.round(m.quantity * mult)) }));
  }
  return out;
}

const LIGHT_MATERIALS: Record<Tier, CraftingMaterial[]> = {
  1: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 6 },
    { itemId: 'resourcePlantFibers', name: 'Plant Fibers', quantity: 4 },
  ],
  2: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 8 },
    { itemId: 'resourceClothFragments', name: 'Cloth Fragments', quantity: 6 },
    { itemId: 'resourceScrapIron', name: 'Scrap Iron', quantity: 4 },
  ],
  3: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 10 },
    { itemId: 'resourceForgedIron', name: 'Forged Iron', quantity: 6 },
    { itemId: 'resourceClothFragments', name: 'Cloth Fragments', quantity: 6 },
  ],
  4: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 12 },
    { itemId: 'resourceForgedIron', name: 'Forged Iron', quantity: 10 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 3 },
  ],
  5: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 14 },
    { itemId: 'resourceForgedSteel', name: 'Forged Steel', quantity: 8 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 5 },
  ],
  6: [
    { itemId: 'resourceLeather', name: 'Leather', quantity: 16 },
    { itemId: 'resourceForgedSteel', name: 'Forged Steel', quantity: 12 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 7 },
    { itemId: 'resourceDuctTape', name: 'Duct Tape', quantity: 2 },
  ],
};

const HEAVY_MATERIALS: Record<Tier, CraftingMaterial[]> = {
  1: [
    { itemId: 'resourceScrapIron', name: 'Scrap Iron', quantity: 8 },
    { itemId: 'resourceLeather', name: 'Leather', quantity: 4 },
  ],
  2: [
    { itemId: 'resourceScrapIron', name: 'Scrap Iron', quantity: 12 },
    { itemId: 'resourceForgedIron', name: 'Forged Iron', quantity: 4 },
  ],
  3: [
    { itemId: 'resourceForgedIron', name: 'Forged Iron', quantity: 10 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 3 },
  ],
  4: [
    { itemId: 'resourceForgedSteel', name: 'Forged Steel', quantity: 8 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 6 },
  ],
  5: [
    { itemId: 'resourceForgedSteel', name: 'Forged Steel', quantity: 12 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 8 },
    { itemId: 'resourceSprings', name: 'Springs', quantity: 2 },
  ],
  6: [
    { itemId: 'resourceForgedSteel', name: 'Forged Steel', quantity: 16 },
    { itemId: 'resourceMechanicalParts', name: 'Mechanical Parts', quantity: 10 },
    { itemId: 'resourceSprings', name: 'Springs', quantity: 4 },
    { itemId: 'resourceDuctTape', name: 'Duct Tape', quantity: 3 },
  ],
};

function lightPiece(
  itemId: string,
  name: string,
  slot: ArmorSlot,
  passiveKey: string,
  passiveLabel: string,
  armorBase: number,
  armorGrowth: number,
  passiveBase: number,
  passiveGrowth: number,
): ArmorSetData['pieces'][ArmorSlot] {
  return {
    itemId,
    name,
    slot,
    passives: [{ key: passiveKey, label: passiveLabel, unit: '%', progression: { base: passiveBase, growth: passiveGrowth, decimals: 1 } }],
    progression: {
      armorRating: { base: armorBase, growth: armorGrowth },
      movementPenaltyPct: { base: 0, growth: 0 },
      staminaPenaltyPct: { base: 1, growth: 0.4, decimals: 1 },
    },
    tierMaterials: scaleMaterials(LIGHT_MATERIALS, slot),
    requiredPerkLevel: { 1: 0, 2: 10, 3: 20, 4: 30, 5: 40, 6: 50 },
  };
}

function heavyPiece(
  itemId: string,
  name: string,
  slot: ArmorSlot,
  passiveKey: string,
  passiveLabel: string,
  armorBase: number,
  armorGrowth: number,
  passiveBase: number,
  passiveGrowth: number,
): ArmorSetData['pieces'][ArmorSlot] {
  return {
    itemId,
    name,
    slot,
    passives: [{ key: passiveKey, label: passiveLabel, unit: '%', progression: { base: passiveBase, growth: passiveGrowth, decimals: 1 } }],
    progression: {
      armorRating: { base: armorBase, growth: armorGrowth },
      movementPenaltyPct: { base: 3, growth: 1.2, decimals: 1 },
      staminaPenaltyPct: { base: 4, growth: 1.6, decimals: 1 },
    },
    tierMaterials: scaleMaterials(HEAVY_MATERIALS, slot),
    requiredPerkLevel: { 1: 0, 2: 10, 3: 20, 4: 30, 5: 40, 6: 50 },
  };
}

function setBonusLevels(
  startValue: number,
  growth: number,
  describe: (value: number) => string,
): SetBonusData_Levels {
  const levels = {} as Record<Tier, { effectValue: number; effectDescription: string }>;
  for (let tier = 1 as Tier; tier <= 6; tier++) {
    const value = Math.round((startValue + growth * (tier - 1)) * 10) / 10;
    levels[tier] = { effectValue: value, effectDescription: describe(value) };
  }
  return levels;
}
type SetBonusData_Levels = Record<Tier, { effectValue: number; effectDescription: string }>;

// ---------------------------------------------------------------------------
// 1) Preacher (Light) — daño vs zombies, cada pieza aporta al mismo stat.
// ---------------------------------------------------------------------------
const preacher: ArmorSetData = {
  id: 'preacher',
  name: 'Preacher',
  class: 'light',
  description: 'Set ligero orientado a daño contra zombies. Cada pieza aporta % de daño adicional.',
  setBonus: {
    name: 'Odd Rites',
    description: 'Con las 4 piezas equipadas: probabilidad de aturdir (stun) a zombies al golpear.',
    levels: setBonusLevels(6, 2, (v) => `+${v}% probabilidad de aturdir al golpear zombies`),
  },
  pieces: {
    helmet: lightPiece('armorPreacherHead', "Preacher's Hat", 'helmet', 'zombieDamage', 'Daño contra zombies', 6, 4.2, 2, 1.4),
    chest: lightPiece('armorPreacherChest', "Preacher's Vest", 'chest', 'zombieDamage', 'Daño contra zombies', 9, 6, 2, 1.4),
    gloves: lightPiece('armorPreacherGloves', "Preacher's Gloves", 'gloves', 'zombieDamage', 'Daño contra zombies', 6, 4.2, 2, 1.4),
    boots: lightPiece('armorPreacherBoots', "Preacher's Boots", 'boots', 'zombieDamage', 'Daño contra zombies', 6, 4.2, 2, 1.4),
  },
};

// ---------------------------------------------------------------------------
// 2) Assassin (Light) — sigilo: daño sigiloso, reducción de ruido, velocidad.
// ---------------------------------------------------------------------------
const assassin: ArmorSetData = {
  id: 'assassin',
  name: 'Assassin',
  class: 'light',
  description: 'Set ligero de sigilo. Cada pieza aporta un stat distinto orientado a stealth.',
  setBonus: {
    name: 'Silent but Deadly',
    description: 'Con las 4 piezas equipadas: multiplicador de daño en ataque sigiloso.',
    levels: setBonusLevels(15, 5, (v) => `x${(1 + v / 100).toFixed(2)} daño en ataques sigilosos (+${v}%)`),
  },
  pieces: {
    helmet: lightPiece('armorAssassinHood', 'Assassin Hood', 'helmet', 'sneakDamage', 'Daño en sigilo', 6, 4.2, 3, 1.8),
    chest: lightPiece('armorAssassinChest', 'Assassin Chestpiece', 'chest', 'noiseReduction', 'Reducción de ruido', 9, 6, 4, 2),
    gloves: lightPiece('armorAssassinGloves', 'Assassin Gloves', 'gloves', 'sneakDamage', 'Daño en sigilo', 6, 4.2, 3, 1.8),
    boots: lightPiece('armorAssassinBoots', 'Assassin Boots', 'boots', 'sneakMoveSpeed', 'Velocidad al agacharse', 6, 4.2, 4, 2),
  },
};

// ---------------------------------------------------------------------------
// 3) Raider (Heavy) — tanque agresivo cuerpo a cuerpo.
// ---------------------------------------------------------------------------
const raider: ArmorSetData = {
  id: 'raider',
  name: 'Raider',
  class: 'heavy',
  description: 'Set pesado orientado a resistencia y combate cuerpo a cuerpo agresivo.',
  setBonus: {
    name: 'Blood Rage',
    description: 'Con las 4 piezas equipadas: recupera salud al matar zombies en melee.',
    levels: setBonusLevels(2, 1, (v) => `Recupera ${v} de vida al rematar zombies cuerpo a cuerpo`),
  },
  pieces: {
    helmet: heavyPiece('armorRaiderHelmet', 'Raider Helmet', 'helmet', 'painResistance', 'Resistencia a aturdimiento', 10, 6.5, 3, 1.6),
    chest: heavyPiece('armorRaiderChest', 'Raider Chestplate', 'chest', 'damageResistance', 'Resistencia a daño', 15, 9, 3, 1.6),
    gloves: heavyPiece('armorRaiderGloves', 'Raider Gloves', 'gloves', 'meleeDamage', 'Daño cuerpo a cuerpo', 10, 6.5, 4, 2),
    boots: heavyPiece('armorRaiderBoots', 'Raider Boots', 'boots', 'fallDamageResistance', 'Resistencia a caídas', 10, 6.5, 5, 2.4),
  },
};

// ---------------------------------------------------------------------------
// 4-15) Resto del roster: stubs con id/nombre/clase para completar después.
// ---------------------------------------------------------------------------
const STUB_SETS: Array<{ id: string; name: string; class: ArmorSetData['class'] }> = [
  { id: 'nomad', name: 'Nomad', class: 'medium' },
  { id: 'scavenger', name: 'Scavenger', class: 'medium' },
  { id: 'farmer', name: 'Farmer', class: 'light' },
  { id: 'nerd', name: 'Nerd', class: 'light' },
  { id: 'punk', name: 'Punk', class: 'medium' },
  { id: 'desperado', name: 'Desperado', class: 'medium' },
  { id: 'mechanic', name: 'Mechanic', class: 'medium' },
  { id: 'athletic', name: 'Athletic', class: 'light' },
  { id: 'military', name: 'Military', class: 'heavy' },
  { id: 'swat', name: 'SWAT', class: 'heavy' },
  { id: 'trader', name: 'Trader', class: 'medium' },
  { id: 'wasteland_guard', name: 'Wasteland Guard', class: 'heavy' },
];

const stubs: ArmorSetData[] = STUB_SETS.map(({ id, name, class: cls }) => ({
  id,
  name,
  class: cls,
  description: 'TODO: completar piezas y stats con datos oficiales de la v3.1.0.',
  setBonus: {
    name: 'TODO',
    description: 'Pendiente de definir.',
    levels: setBonusLevels(0, 0, () => 'TODO: completar con datos del juego'),
  },
  pieces: {},
}));

const allSets: ArmorSetData[] = [preacher, assassin, raider, ...stubs];

const outPath = path.join(__dirname, '..', 'src', 'data', 'armorSets.json');
writeFileSync(outPath, JSON.stringify(allSets, null, 2) + '\n', 'utf-8');
console.log(`Generado ${outPath} con ${allSets.length} sets (3 completos + ${stubs.length} stubs).`);
