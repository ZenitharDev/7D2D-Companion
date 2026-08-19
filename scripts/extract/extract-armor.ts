// Extrae datos reales de armadura desde los XML del juego instalado y los
// vuelca en src/data/armorSets.json, usando scripts/extract/mapping.json
// como diccionario editable. Pensado para volver a correrse en cada update
// del juego.
//
// Uso:
//   npx tsx scripts/extract/extract-armor.ts --config "C:\...\Data\Config" [--gameVersion 1.2.3] [--out src/data/armorSets.json]
//
// Cómo funciona el juego real (verificado contra una instalación real, no
// asumido): hay UN item por (set, slot) — no un item por tier. El "Tier" es
// la Quality (1-6) de ese item. La mayoría de sus stats son:
//   - un RANGO [valor en Q1, valor en Q6] interpolado linealmente
//     (ej. PhysicalDamageResist = armor rating), o
//   - una lista EXPLÍCITA de 6 valores, uno por calidad (ej. EntityDamage
//     en Preacher Gloves: ".1,.2,.3,.4,.5,.6"), o
//   - un valor FIJO igual en las 6 calidades (ej. Mobility, StaminaChangeOT).
// El Set Bonus vive en buffs.xml como un buff separado (buff{Set}SetBonus)
// que se activa/escala según ArmorGroupCount/ArmorGroupLowestQuality — exactamente
// el mecanismo "las 4 piezas, nivel = la de menor calidad" que ya modelábamos.
//
// Filosofía de seguridad: si algo no se puede resolver con confianza, NO se
// inventa un valor: se conserva lo que ya había en armorSets.json para ese
// campo y se deja un warning en extract-report.json.

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllDisplayValues, getAllPassiveEffects, getProperties, loadXml, toArray } from './xml.js';
import type { BuffsXmlRoot, ItemsXmlRoot, RecipesXmlRoot, XmlBuff, XmlItem, XmlPassiveEffect } from './xml.js';
import { buildLocalizationMap } from './csv.js';
import type {
  ArmorPieceData,
  ArmorSetData,
  ArmorSlot,
  CraftingMaterial,
  ExplicitProgression,
  PassiveEntry,
  SetBonusData,
  StatProgression,
  Tier,
} from '../../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const TIERS: Tier[] = [1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
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
  process.exit(1);
}
const gameVersion = args.gameVersion ?? 'desconocida (pasar --gameVersion X.Y.Z)';
const outPath = args.out ? path.resolve(args.out) : path.join(REPO_ROOT, 'src', 'data', 'armorSets.json');

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
const mappingPath = path.join(__dirname, 'mapping.json');
const mappingDefaultPath = path.join(__dirname, 'mapping.default.json');
if (!existsSync(mappingPath)) {
  copyFileSync(mappingDefaultPath, mappingPath);
  console.log('No existía scripts/extract/mapping.json: se creó una copia de mapping.default.json.');
}

interface SetMapping {
  id: string;
  name: string;
  armorGroup: string;
  setBonusBuff: string;
}

interface Mapping {
  files: { items: string; recipes: string; buffs: string; localization: string };
  excludedEffectNames: string[];
  armorRatingEffectName: string;
  mobilityEffectName: string;
  staminaEffectName: string;
  staminaEffectTag: string;
  sets: SetMapping[];
  slotByEquipSlot: Record<string, ArmorSlot>;
}

const mapping = JSON.parse(readFileSync(mappingPath, 'utf-8')) as Mapping;

// ---------------------------------------------------------------------------
// Cargar XML / localización
// ---------------------------------------------------------------------------
const itemsPath = path.join(configDir, mapping.files.items);
const recipesPath = path.join(configDir, mapping.files.recipes);
const buffsPath = path.join(configDir, mapping.files.buffs);
const localizationPath = path.join(configDir, mapping.files.localization);

const itemsRoot = loadXml<ItemsXmlRoot>(itemsPath);
const allItems = toArray(itemsRoot.items?.item);

let recipesByItemName = new Map<string, ReturnType<typeof toArray<{ name: string; count?: string }>>>();
let recipeEffectsByItemName = new Map<string, XmlPassiveEffect[]>();
if (existsSync(recipesPath)) {
  const recipesRoot = loadXml<RecipesXmlRoot>(recipesPath);
  for (const recipe of toArray(recipesRoot.recipes?.recipe)) {
    recipesByItemName.set(recipe.name, toArray(recipe.ingredient));
    const effects = toArray(recipe.effect_group).flatMap((g) => toArray(g.passive_effect));
    recipeEffectsByItemName.set(recipe.name, effects);
  }
} else {
  console.warn(`No se encontró recipes.xml en ${recipesPath}; no se podrán extraer materiales.`);
}

let buffsByName = new Map<string, XmlBuff>();
if (existsSync(buffsPath)) {
  const buffsRoot = loadXml<BuffsXmlRoot>(buffsPath);
  for (const buff of toArray(buffsRoot.buffs?.buff)) buffsByName.set(buff.name, buff);
} else {
  console.warn(`No se encontró buffs.xml en ${buffsPath}; no se podrá extraer el Set Bonus.`);
}

let localization: Map<string, string> | null = null;
if (existsSync(localizationPath)) {
  localization = buildLocalizationMap(readFileSync(localizationPath, 'utf-8'));
} else {
  console.warn(`No se encontró ${mapping.files.localization} en ${configDir}; se usarán nombres crudos del XML.`);
}

const existingSets: ArmorSetData[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : [];
const existingById = new Map(existingSets.map((s) => [s.id, s]));

interface ExtractWarning {
  setId: string;
  slot?: ArmorSlot;
  message: string;
}
const warnings: ExtractWarning[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** El juego guarda saltos de línea como los 2 caracteres literales "\n" dentro del CSV (para que su propio renderer de texto los interprete), no como salto de línea real. Los normalizamos acá para que se vean bien en cualquier consumidor (CLI, web). */
function unescapeGameText(s: string): string {
  return s.replace(/\\n/g, '\n');
}

/**
 * The game's own passive_effect names (from items.xml) are internal engine
 * identifiers, not display text — there's no "<Name>Desc" Localization key
 * for most of them (verified: only item/buff names and Set Bonus tooltips
 * are localized, not individual stat names). This is a hand-maintained
 * translation table, not extracted data — extend it if a new effect name
 * shows up after a future re-extraction and ends up unmapped (falls back
 * to the raw engine name, so nothing breaks, it's just less readable).
 */
const STAT_LABELS: Record<string, string> = {
  AttacksPerMinute: 'Attack Speed',
  BarteringBuying: 'Buy Price',
  BarteringSelling: 'Sell Price',
  BlockDamage: 'Block Damage',
  BuffResistance: 'Crit Resist',
  CarryCapacity: 'Carry Capacity',
  CrouchSpeed: 'Crouch Speed',
  DamageBonus: 'Damage Bonus',
  EnemySearchDuration: 'Stealth Detection Time',
  EntityDamage: 'Damage',
  FoodLossPerStaminaPointGained: 'Food Efficiency',
  GeneralDamageResist: 'Damage Resistance',
  HarvestCount: 'Harvest Yield',
  HealthMax: 'Max Health',
  LightMultiplier: 'Light Radius',
  LockPickBreakChance: 'Lockpick Break Chance',
  LockPickTime: 'Lockpick Speed',
  LootProb: 'Loot Chance',
  LootStage: 'Loot Stage',
  NoiseMultiplier: 'Noise',
  PlayerExpGain: 'XP Gain',
  RoundsPerMinute: 'Fire Rate',
  RunSpeed: 'Run Speed',
  ScavengingTime: 'Scavenging Speed',
  SilenceBlockSteps: 'Silent Footsteps',
  StaminaLoss: 'Stamina Drain',
  StaminaMax: 'Max Stamina',
  VehicleFuelUsePer: 'Vehicle Fuel Use',
  WaterLossPerStaminaPointGained: 'Water Efficiency',
};

/** Same idea as STAT_LABELS, but for the `tags` that disambiguate two occurrences of the same stat on one item (ex. general debuff resistance vs. stun resistance specifically). Exact full-tags-string entries win over per-tag ones. */
const TAG_LABELS: Record<string, string> = {
  buffInjuryStunned01: 'Stun',
  'salvageHarvest,allHarvest': 'Salvage',
  farmerBonusHarvest: 'Crops',
  farmerBonusSeed: 'Seeds',
  lumberjackHarvest: 'Wood',
  oreWoodHarvest: 'Ore & Wood',
  seedSkill: 'Seeds',
  trashPile: 'Trash Piles',
  ore: 'Ore',
  axe: 'Axe',
  fitness: 'Fitness',
  Harvesting: 'Harvesting',
  perkDeadEye: 'Dead Eye',
};

/**
 * Labels for the hidden per-tier bonuses that only show up as
 * <display_value name="d...">, never as a plain <passive_effect> (see
 * XmlDisplayValue). Hand-mapped from what each one's cvar/flavor text
 * actually does — the internal names ("dCritResist", "dAttributeLevel") give
 * no useful label on their own. Extend this after a re-extraction if a new
 * one shows up unmapped (falls back to a humanized version of the raw name).
 */
const DISPLAY_VALUE_LABELS: Record<string, string> = {
  dCritResist: 'Crit Injury Resist',
  dNaturalCritHealing: 'Crit Injury Healing',
  dTreatedCritHealing: 'Crit Injury Healing',
  dAttributeLevel: 'Skill Point Chance',
  dDamageResist: 'Damage Resistance',
  dFallDamage: 'Fall Damage Resist',
  dFitnessBartering: 'Bartering (Fitness)',
  dStunResist: 'Stun Resist',
  dHarvestCount: 'Harvest Yield',
  dStaminaRegen: 'Stamina Regen',
  dStaminaLoss: 'Stamina Drain',
  dFoodWaterUse: 'Food & Water Use',
  dLockpickSpeed: 'Lockpick Speed',
  dHarvestSalvage: 'Salvage Yield',
};

function humanizeDisplayValueName(name: string): string {
  return name
    .replace(/^d/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

function humanizeTag(tag: string): string {
  return tag
    .replace(/^buff/, '')
    .replace(/(CHTrigger|Trigger|Catch)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * The same passive_effect (ex. "BuffResistance") can appear more than once
 * on one item with different `tags` — a generic resistance to many status
 * effects, and another specific to just one (ex. stun). Without
 * distinguishing them the UI shows what looks like the same stat repeated.
 * A long tag list (>2) reads as "the generic one" and gets no qualifier;
 * a short, specific tag list gets a short human qualifier in parentheses.
 * Only applies when there's no real Localization description for the
 * effect name itself; if there is, it's used as-is.
 */
function disambiguatedLabel(effectName: string, tags: string | undefined, localizedFallback: string): string {
  if (localizedFallback !== effectName) return localizedFallback;
  const base = STAT_LABELS[effectName] ?? effectName;
  if (!tags) return base;
  if (TAG_LABELS[tags]) return `${base} (${TAG_LABELS[tags]})`;
  const tagList = tags.split(',').map((t) => t.trim());
  if (tagList.length > 2) return base;
  return `${base} (${tagList.map((t) => TAG_LABELS[t] ?? humanizeTag(t)).join(', ')})`;
}

function localize(key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const value = localization?.get(key);
  return value !== undefined ? unescapeGameText(value) : fallback;
}

/**
 * Cada pieza tiene su propia frase de sabor en su DescriptionKey de
 * Localization, con el formato fijo (verificado en los 15 sets):
 * "<Light|Medium|Heavy> Armor\n<frase que explica el pasivo propio de la pieza>\n\nFull Set Bonus: <texto genérico del set>".
 * Extraemos solo la frase del medio — el resto ya lo tenemos por otro lado
 * (armorRating -> clase, Full Set Bonus -> setBonus.description).
 */
function extractPieceFlavor(item: XmlItem): string | undefined {
  const descKey = getProperties(item).find((p) => p.name === 'DescriptionKey')?.value ?? `${item.name}Desc`;
  const raw = localize(descKey, '');
  if (!raw) return undefined;
  const match = raw.match(/Armor\n([\s\S]*?)\n\nFull Set Bonus:/);
  return match?.[1]?.trim();
}

function parseValueList(raw: string): number[] {
  return raw.split(',').map((s) => Number(s.trim()));
}

/**
 * El motor mezcla perc_add (fracción, ej. .075 = 7.5%) y base_add con
 * fracciones equivalentes (ambos son % reales, confirmado contra el texto
 * de Localization: "reduces X by {cvar}%"). base_set en cambio es un
 * contador/flag absoluto (ej. SilenceBlockSteps=1), nunca un %, aunque su
 * valor caiga en [-1,1] por casualidad.
 */
function inferUnit(values: number[], operation: string | undefined): '%' | 'flat' {
  if (operation === 'base_set') return 'flat';
  return values.every((v) => v >= -1 && v <= 1) ? '%' : 'flat';
}

function toDisplayValues(values: number[], unit: '%' | 'flat'): number[] {
  return unit === '%' ? values.map((v) => Math.round(v * 1000) / 10) : values;
}

/** Construye una progresión explícita 1..6 a partir de 1, 2 (min/max, interpolado) o 6 (uno por tier) valores. */
function buildProgressionFromValues(values: number[]): ExplicitProgression | null {
  const values6 =
    values.length === 6
      ? values
      : values.length === 2
        ? TIERS.map((t) => values[0]! + ((values[1]! - values[0]!) * (t - 1)) / 5)
        : values.length === 1
          ? TIERS.map(() => values[0]!)
          : null;
  if (!values6) return null;
  const out: Partial<Record<Tier, number>> = {};
  TIERS.forEach((t, i) => (out[t] = Math.round(values6[i]! * 100) / 100));
  return { kind: 'explicit', values: out };
}

function findEffect(effects: XmlPassiveEffect[], name: string): XmlPassiveEffect | undefined {
  return effects.find((e) => e.name === name);
}

/** True if two progressions land on the exact same number for every tier — used to drop a display_value that's just a UI restatement of a passive_effect we already captured. */
function sameValues(a: StatProgression, b: ExplicitProgression): boolean {
  if (a.kind !== 'explicit') return false;
  return TIERS.every((t) => a.values[t] === b.values[t]);
}

function classFromTags(tags: string | undefined): 'light' | 'medium' | 'heavy' | null {
  if (!tags) return null;
  if (/lightArmor/.test(tags)) return 'light';
  if (/mediumArmor/.test(tags)) return 'medium';
  if (/heavyArmor/.test(tags)) return 'heavy';
  return null;
}

/** CraftingIngredientCount tiene level="2,3,6" value="5,10,25": "sostiene" el último valor definido hasta el próximo breakpoint (función escalón). No confirmado 100% contra el motor del juego — es la interpretación más razonable dado el patrón de datos; ver README. */
function stepLookup(levels: number[], values: number[], tier: number): number {
  let result = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]! <= tier) result = values[i]!;
  }
  return result;
}

function materialsForItemAtTier(itemName: string, tier: Tier): CraftingMaterial[] {
  const baseIngredients = recipesByItemName.get(itemName) ?? [];
  const stepEffects = (recipeEffectsByItemName.get(itemName) ?? []).filter((e) => e.name === 'CraftingIngredientCount');

  const quantities = new Map<string, number>();
  for (const ing of baseIngredients) {
    const count = ing.count ? Number(ing.count) : 0;
    if (count > 0) quantities.set(ing.name, count);
  }
  for (const effect of stepEffects) {
    const resource = effect.tags;
    if (!resource || !effect.value || !effect.level) continue;
    const levelNums = parseValueList(effect.level);
    const valueNums = parseValueList(effect.value);
    const add = stepLookup(levelNums, valueNums, tier);
    if (add > 0) quantities.set(resource, (quantities.get(resource) ?? 0) + add);
  }

  return [...quantities.entries()].map(([itemId, quantity]) => ({
    itemId,
    name: localize(itemId, itemId),
    quantity,
  }));
}

// ---------------------------------------------------------------------------
// Extracción de una pieza
// ---------------------------------------------------------------------------
function extractPiece(item: XmlItem, existingPiece: ArmorPieceData | undefined, slot: ArmorSlot, setId: string): ArmorPieceData | null {
  const effects = getAllPassiveEffects(item);
  const consumedNames = new Set([mapping.armorRatingEffectName, mapping.mobilityEffectName, mapping.staminaEffectName, ...mapping.excludedEffectNames]);

  const armorEffect = findEffect(effects, mapping.armorRatingEffectName);
  if (!armorEffect?.value) {
    warnings.push({ setId, slot, message: `No se encontró "${mapping.armorRatingEffectName}" en ${item.name}; se conserva armorRating anterior.` });
  }
  const armorValues = armorEffect?.value ? parseValueList(armorEffect.value) : [];
  const armorRating =
    armorValues.length === 2
      ? buildProgressionFromValues(armorValues)
      : null;
  if (armorEffect && armorValues.length !== 2) {
    warnings.push({ setId, slot, message: `"${mapping.armorRatingEffectName}" en ${item.name} no tiene 2 valores (min,max): "${armorEffect.value}".` });
  }

  const mobilityEffect = findEffect(effects, mapping.mobilityEffectName);
  const mobilityValues = mobilityEffect?.value ? parseValueList(mobilityEffect.value) : [0];
  const movementProg = buildProgressionFromValues(mobilityValues.length === 1 ? [mobilityValues[0]! * 100] : mobilityValues.map((v) => v * 100));

  const staminaEffect = effects.find((e) => e.name === mapping.staminaEffectName && e.tags?.includes(mapping.staminaEffectTag));
  const staminaValues = staminaEffect?.value ? parseValueList(staminaEffect.value) : [0];
  const staminaProg = buildProgressionFromValues(staminaValues.length === 1 ? [staminaValues[0]! * 100] : staminaValues.map((v) => v * 100));

  // Pasivos propios: todo lo que no sea armor/mobility/stamina/ruido de clase ni esté en la lista de exclusión.
  const passives: PassiveEntry[] = [];
  const seen = new Set<string>();
  for (const effect of effects) {
    if (consumedNames.has(effect.name)) continue;
    if (!effect.value) continue;
    // ProgressionLevel = gated behind a specific perk/magazine level, not guaranteed for a random
    // player (ex. Enforcer Outfit's GeneralDamageResist needs perkEnforcerApparel). Other requirement
    // types (CVarCompare, IsEquipped, ...) just describe WHEN a normal stat applies during play
    // (ex. Assassin's light reduction only while crouching in the dark) — still worth showing.
    const progressionGate = effect.requirement?.find((r) => r.name === 'ProgressionLevel');
    if (progressionGate) {
      warnings.push({ setId, slot, message: `Pasivo "${effect.name}" en ${item.name} requiere progreso de perk (${progressionGate.progression_name ?? '?'}); se omite por no ser garantizado.` });
      continue;
    }
    const dedupeKey = `${effect.name}|${effect.tags ?? ''}`;
    if (seen.has(dedupeKey)) continue; // evita duplicar si el mismo efecto aparece 2 veces (ej. jitter)
    seen.add(dedupeKey);

    const rawValues = parseValueList(effect.value);
    if (![1, 2, 6].includes(rawValues.length)) {
      warnings.push({ setId, slot, message: `Pasivo "${effect.name}" en ${item.name} tiene ${rawValues.length} valores (esperaba 1, 2 o 6): "${effect.value}". Se omite.` });
      continue;
    }
    const unit = inferUnit(rawValues, effect.operation);
    const displayValues = toDisplayValues(rawValues, unit);
    const progression = buildProgressionFromValues(displayValues);
    if (!progression) continue;

    passives.push({
      key: effect.name,
      label: disambiguatedLabel(effect.name, effect.tags, localize(`${effect.name}Desc`, effect.name)),
      unit,
      progression,
      tags: effect.tags,
    });
  }

  // Pasivos "ocultos" que solo existen como <display_value name="d..." value="v1,...,v6" tier="1,...,6"/>
  // (el número real vive en un triggered_effect/cvar que no vale la pena rastrear a mano por set).
  // Muchos de estos son solo una restatement visual de un passive_effect que YA capturamos arriba
  // (mismos 6 valores) — si coincide exacto con algo que ya tenemos, se omite para no duplicar la fila.
  for (const dv of getAllDisplayValues(item)) {
    if (!dv.value || !dv.tier) continue;
    const rawValues = parseValueList(dv.value);
    if (rawValues.length !== 6) continue; // los de 1 valor son solo redundancia visual de un stat que ya capturamos aparte
    if (seen.has(`display:${dv.name}`)) continue;
    seen.add(`display:${dv.name}`);

    const unit = inferUnit(rawValues, 'perc_add');
    const displayValues = toDisplayValues(rawValues, unit);
    const progression = buildProgressionFromValues(displayValues);
    if (!progression) continue;
    if (passives.some((p) => sameValues(p.progression, progression))) continue;

    passives.push({
      key: dv.name,
      label: DISPLAY_VALUE_LABELS[dv.name] ?? humanizeDisplayValueName(dv.name),
      unit,
      progression,
    });
  }

  const tierMaterials = TIERS.reduce((acc, t) => {
    acc[t] = materialsForItemAtTier(item.name, t);
    return acc;
  }, {} as Record<Tier, CraftingMaterial[]>);
  if (Object.values(tierMaterials).every((m) => m.length === 0)) {
    warnings.push({ setId, slot, message: `Sin receta encontrada en recipes.xml para "${item.name}".` });
  }

  return {
    itemId: item.name,
    name: localize(item.name, existingPiece?.name ?? item.name),
    slot,
    description: extractPieceFlavor(item) ?? existingPiece?.description,
    passives: passives.length > 0 ? passives : existingPiece?.passives ?? [],
    progression: {
      armorRating: armorRating ?? existingPiece?.progression.armorRating ?? { kind: 'explicit', values: {} },
      movementPenaltyPct: movementProg ?? existingPiece?.progression.movementPenaltyPct ?? { kind: 'explicit', values: {} },
      staminaPenaltyPct: staminaProg ?? existingPiece?.progression.staminaPenaltyPct ?? { kind: 'explicit', values: {} },
    },
    tierMaterials,
  };
}

// ---------------------------------------------------------------------------
// Extracción del Set Bonus (buffs.xml)
// ---------------------------------------------------------------------------
function extractSetBonus(setMapping: SetMapping): SetBonusData | null {
  const buff = buffsByName.get(setMapping.setBonusBuff);
  if (!buff) {
    warnings.push({ setId: setMapping.id, message: `No se encontró el buff "${setMapping.setBonusBuff}" en buffs.xml.` });
    return null;
  }

  const name = localize(buff.name_key, setMapping.setBonusBuff);
  const description = localize(buff.tooltip_key, name);
  const template = localize(buff.description_key, '');

  const levels: Partial<Record<Tier, { effectValue: number; effectDescription: string }>> = {};

  for (const group of toArray(buff.effect_group)) {
    const req = toArray(group.requirement).find((r) => r.name === 'ArmorGroupLowestQuality' && r.group_name === setMapping.armorGroup && r.operation === 'Equals');
    if (!req?.value) continue;
    const tier = Number(req.value) as Tier;
    if (!TIERS.includes(tier)) continue;

    const cvarValues = new Map<string, number>();
    for (const trig of toArray(group.triggered_effect)) {
      if (trig.action !== 'ModifyCVar' || trig.trigger !== 'onSelfBuffStart' || !trig.cvar || trig.value === undefined) continue;
      for (const cvarName of trig.cvar.split(',')) {
        cvarValues.set(cvarName.replace(/^\./, '').trim(), Number(trig.value));
      }
    }

    let effectDescription = template;
    if (template) {
      effectDescription = template.replace(/\{cvar\(\.([\w]+):[^)]*\)\}/g, (_match, cvarName) => {
        const v = cvarValues.get(cvarName);
        return v !== undefined ? String(v) : '?';
      });
    }
    const effectValue = [...cvarValues.values()][0] ?? 0;
    levels[tier] = { effectValue, effectDescription: effectDescription || `Nivel ${tier}` };
  }

  const missingLevels = TIERS.filter((t) => !levels[t]);
  if (missingLevels.length > 0) {
    warnings.push({ setId: setMapping.id, message: `Set bonus "${setMapping.setBonusBuff}": faltan niveles ${missingLevels.join(', ')} (no se encontró su ArmorGroupLowestQuality en buffs.xml).` });
  }
  if (missingLevels.length === 6) return null;

  const filledLevels = TIERS.reduce((acc, t) => {
    acc[t] = levels[t] ?? { effectValue: 0, effectDescription: 'TODO: nivel no encontrado en buffs.xml' };
    return acc;
  }, {} as Record<Tier, { effectValue: number; effectDescription: string }>);

  return { name, description, levels: filledLevels };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const resultSets: ArmorSetData[] = [];

for (const setMapping of mapping.sets) {
  try {
    const setItems = allItems.filter((item) => getProperties(item).some((p) => p.name === 'ArmorGroup' && p.value === setMapping.armorGroup));
    const existing = existingById.get(setMapping.id);

    if (setItems.length === 0) {
      warnings.push({ setId: setMapping.id, message: `No se encontró ningún item con ArmorGroup="${setMapping.armorGroup}". Se conserva el set existente sin cambios.` });
      if (existing) resultSets.push(existing);
      continue;
    }

    let detectedClass: 'light' | 'medium' | 'heavy' | null = null;
    const pieces: Partial<Record<ArmorSlot, ArmorPieceData>> = {};

    for (const item of setItems) {
      const props = getProperties(item);
      const equipSlotRaw = props.find((p) => p.name === 'EquipSlot')?.value;
      const slot = equipSlotRaw ? mapping.slotByEquipSlot[equipSlotRaw] : undefined;
      if (!slot) {
        warnings.push({ setId: setMapping.id, message: `Item "${item.name}" (ArmorGroup=${setMapping.armorGroup}) tiene EquipSlot="${equipSlotRaw}" sin mapear; se omite.` });
        continue;
      }
      if (pieces[slot]) {
        // Más de un item comparte (ArmorGroup, EquipSlot) — ej. variantes "Demo"/dev usadas para previews.
        // Nos quedamos con la primera coincidencia (orden del XML) y avisamos, en vez de pisarla en silencio.
        warnings.push({ setId: setMapping.id, slot, message: `Múltiples items para el slot "${slot}": se usó "${pieces[slot]!.itemId}", se ignoró "${item.name}".` });
        continue;
      }
      if (!detectedClass) detectedClass = classFromTags(props.find((p) => p.name === 'Tags')?.value);

      const extracted = extractPiece(item, existing?.pieces[slot], slot, setMapping.id);
      if (extracted) pieces[slot] = extracted;
    }

    const missingSlots = (['helmet', 'chest', 'gloves', 'boots'] as ArmorSlot[]).filter((s) => !pieces[s]);
    if (missingSlots.length > 0) {
      warnings.push({ setId: setMapping.id, message: `Faltan piezas para los slots: ${missingSlots.join(', ')}.` });
    }

    const extractedSetBonus = extractSetBonus(setMapping);
    if (!extractedSetBonus) {
      warnings.push({ setId: setMapping.id, message: `No se pudo extraer el Set Bonus; se conserva el anterior si había.` });
    }
    const setBonus =
      extractedSetBonus ??
      existing?.setBonus ?? {
        name: 'TODO',
        description: 'Pendiente de definir.',
        levels: TIERS.reduce((acc, t) => {
          acc[t] = { effectValue: 0, effectDescription: 'TODO' };
          return acc;
        }, {} as SetBonusData['levels']),
      };

    resultSets.push({
      id: setMapping.id,
      name: setMapping.name,
      class: detectedClass ?? existing?.class ?? 'medium',
      description: existing?.description,
      setBonus,
      pieces: { ...existing?.pieces, ...pieces },
      dataSource: 'extracted',
      extraction: {
        gameVersion,
        extractedAt: new Date().toISOString(),
        sourceFiles: [mapping.files.items, mapping.files.recipes, mapping.files.buffs, mapping.files.localization],
      },
    });
  } catch (err) {
    warnings.push({ setId: setMapping.id, message: `Error inesperado: ${(err as Error).message}. Se conserva el set existente sin cambios.` });
    const existing = existingById.get(setMapping.id);
    if (existing) resultSets.push(existing);
  }
}

for (const existing of existingSets) {
  if (!resultSets.find((s) => s.id === existing.id)) resultSets.push(existing);
}

writeFileSync(outPath, JSON.stringify(resultSets, null, 2) + '\n', 'utf-8');

const reportDir = path.join(__dirname, 'output');
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'extract-report.json');
writeFileSync(
  reportPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), gameVersion, configDir, setsProcessed: mapping.sets.length, warnings }, null, 2) + '\n',
  'utf-8',
);

console.log(`\nListo. ${resultSets.length} sets escritos en ${outPath}.`);
console.log(`${warnings.length} avisos — ver detalle en ${reportPath}.`);
if (warnings.length > 0) {
  console.log('\nPrimeros avisos:');
  for (const w of warnings.slice(0, 15)) {
    console.log(`  [${w.setId}${w.slot ? '/' + w.slot : ''}] ${w.message}`);
  }
}
