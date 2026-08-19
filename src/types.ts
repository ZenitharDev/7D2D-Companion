// Modelo de datos para el sistema de armaduras de 7 Days to Die.
//
// Este modelo está calcado de cómo el juego realmente representa las
// armaduras en Data/Config (ver scripts/extract/):
//
// - Hay UN item por (set, slot) — no un item distinto por Tier. El "Tier"
//   es la Quality (1-6) de ESE item, y la mayoría de sus stats son un rango
//   [valor en Q1, valor en Q6] interpolado linealmente entre calidades
//   (`PhysicalDamageResist` = armor rating), o una lista explícita de 6
//   valores, uno por calidad (los "pasivos" propios de cada pieza, ej.
//   `EntityDamage` en Preacher Gloves).
// - La movilidad (`Mobility`) y el gasto de estamina (`StaminaChangeOT`) son
//   un valor FIJO por pieza, igual en las 6 calidades (no empeoran al
//   craftear una versión mejor de la misma pieza).
// - Una pieza puede tener 0, 1 o varios stats pasivos propios (no
//   necesariamente uno solo).
// - El Set Bonus se activa cuando las 4 piezas comparten el mismo
//   "ArmorGroup" y escala según la Quality de la pieza de MENOR calidad
//   equipada (`ArmorGroupLowestQuality`), tal cual está en buffs.xml.
//
// StatProgression admite tanto datos reales extraídos del XML
// (ExplicitProgression: valores concretos por tier) como datos placeholder
// hechos a mano (LinearProgression: base + growth).

export type ArmorSlot = 'helmet' | 'chest' | 'gloves' | 'boots';

export type ArmorClass = 'light' | 'medium' | 'heavy';

export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export const TIERS: Tier[] = [1, 2, 3, 4, 5, 6];

export interface CraftingMaterial {
  itemId: string;
  name: string;
  quantity: number;
}

/** value(tier) = round(base + growth * (tier - 1)) */
export interface LinearProgression {
  kind?: 'linear';
  base: number;
  growth: number;
  /** Si se define, redondea a este número de decimales (default 0 = entero). */
  decimals?: number;
}

/**
 * Valores concretos por tier, tal cual salen de items.xml (no todo escala
 * linealmente en el juego real). Usado por el extractor; los sets placeholder
 * usan LinearProgression.
 */
export interface ExplicitProgression {
  kind: 'explicit';
  values: Partial<Record<Tier, number>>;
}

export type StatProgression = LinearProgression | ExplicitProgression;

/** Un stat pasivo propio de una pieza (ej. Preacher Gloves -> EntityDamage +10%..+60%). */
export interface PassiveEntry {
  /** Clave estable (normalmente el nombre del passive_effect en el XML, ej. "EntityDamage"). */
  key: string;
  /** Etiqueta legible. */
  label: string;
  unit: '%' | 'flat';
  progression: StatProgression;
  /** Tags del passive_effect original, si los tenía (ej. a qué se aplica el bonus). */
  tags?: string;
}

export interface ArmorPieceData {
  itemId: string;
  name: string;
  slot: ArmorSlot;
  /** Frase de sabor propia de la pieza (ej. "Increases stun resistance."), sacada del DescriptionKey del item en Localization — el texto real que muestra el juego para explicar qué hace esta pieza en particular. */
  description?: string;
  /** 0, 1 o varios pasivos propios de la pieza — no todas las piezas tienen uno. */
  passives: PassiveEntry[];
  progression: {
    armorRating: StatProgression;
    /** Fijo por pieza en el juego real (no varía por tier), pero se modela igual como StatProgression por consistencia. */
    movementPenaltyPct: StatProgression;
    /** Ídem: fijo por pieza. */
    staminaPenaltyPct: StatProgression;
  };
  /** Materiales de crafteo requeridos para construir la pieza en cada tier. En el juego real la RECETA es una sola (no elegís tier al craftear, sale por RNG/skill); el extractor deriva el costo por tier a partir de CraftingIngredientCount en recipes.xml. */
  tierMaterials: Record<Tier, CraftingMaterial[]>;
  /** Nivel de perk / libro requerido para desbloquear la receta (opcional, informativo). */
  requiredPerkLevel?: Partial<Record<Tier, number>>;
}

export interface SetBonusLevel {
  effectValue: number;
  effectDescription: string;
}

export interface SetBonusData {
  name: string;
  /** Descripción genérica del efecto, sin el valor concreto (ese vive en `levels`). */
  description: string;
  levels: Record<Tier, SetBonusLevel>;
}

export interface ArmorSetData {
  id: string;
  name: string;
  class: ArmorClass;
  description?: string;
  setBonus: SetBonusData;
  /** Partial: no todos los sets de ejemplo necesitan las 4 piezas completas todavía. */
  pieces: Partial<Record<ArmorSlot, ArmorPieceData>>;
  /** Procedencia de los datos: 'placeholder' (a mano, ilustrativo) o 'extracted' (leído de los XML del juego). */
  dataSource?: 'placeholder' | 'extracted';
  /** Sello del extractor: versión de juego leída y timestamp de la última corrida. Ausente en sets placeholder. */
  extraction?: { gameVersion: string; extractedAt: string; sourceFiles: string[] };
}

// ---------------------------------------------------------------------------
// Tipos de entrada/salida del calculador
// ---------------------------------------------------------------------------

export interface SlotSelection {
  setId: string;
  tier: Tier;
}

export type BuildSelection = Partial<Record<ArmorSlot, SlotSelection>>;

export interface BuffEntry {
  slot: ArmorSlot;
  setId: string;
  setName: string;
  pieceName: string;
  itemId: string;
  tier: Tier;
  statKey: string;
  statLabel: string;
  value: number;
  unit: '%' | 'flat';
  tags?: string;
}

export interface SetBonusResult {
  setId: string;
  setName: string;
  piecesEquipped: number;
  active: boolean;
  /** Tier de menor calidad entre las piezas equipadas del set (determina el nivel del bonus). */
  effectiveLevel: Tier | null;
  bonusName: string;
  bonusDescription: string;
  effect: SetBonusLevel | null;
}

export interface MaterialRequirement {
  itemId: string;
  name: string;
  quantity: number;
}

export type NoiseLabel = 'Stealthy' | 'Moderate' | 'Loud' | 'Very loud';

export interface ArmorBuildResult {
  totalArmorRating: number;
  penalties: {
    movementPenaltyPct: number;
    staminaPenaltyPct: number;
    /** Suma de los NoiseMultiplier reales de las piezas equipadas (0 si ninguna define uno). */
    noiseIndex: number;
    noiseLabel: NoiseLabel;
  };
  passives: BuffEntry[];
  setBonuses: SetBonusResult[];
  materials: MaterialRequirement[];
  slots: Partial<
    Record<
      ArmorSlot,
      { setId: string; setName: string; pieceName: string; itemId: string; tier: Tier; armorRating: number }
    >
  >;
  warnings: string[];
}
