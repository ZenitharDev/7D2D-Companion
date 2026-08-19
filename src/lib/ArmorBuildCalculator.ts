import type {
  ArmorBuildResult,
  ArmorSetData,
  ArmorSlot,
  BuildSelection,
  MaterialRequirement,
  NoiseLabel,
  SetBonusResult,
  Tier,
} from '../types.js';
import { expandTierStats, progressionValue } from './expand.js';

const ALL_SLOTS: ArmorSlot[] = ['helmet', 'chest', 'gloves', 'boots'];

/** Stat pasivo que el juego usa para el sigilo (NoiseMultiplier, perc_add). No todas las piezas lo definen. */
const NOISE_STAT_KEY = 'NoiseMultiplier';

function noiseLabel(index: number): NoiseLabel {
  if (index <= -30) return 'Stealthy';
  if (index <= 0) return 'Moderate';
  if (index <= 20) return 'Loud';
  return 'Very loud';
}

export class ArmorBuildCalculator {
  private readonly setsById: Map<string, ArmorSetData>;

  constructor(sets: ArmorSetData[]) {
    this.setsById = new Map(sets.map((s) => [s.id, s]));
  }

  /** Sets disponibles, para poblar un selector de UI por ejemplo. */
  listSets(): ArmorSetData[] {
    return [...this.setsById.values()];
  }

  calculate(selection: BuildSelection): ArmorBuildResult {
    const warnings: string[] = [];
    const result: ArmorBuildResult = {
      totalArmorRating: 0,
      penalties: { movementPenaltyPct: 0, staminaPenaltyPct: 0, noiseIndex: 0, noiseLabel: 'Moderate' },
      passives: [],
      setBonuses: [],
      materials: [],
      slots: {},
      warnings,
    };

    const materialsByItem = new Map<string, MaterialRequirement>();
    let noiseAccumulatorPct = 0;
    let hasNoiseData = false;

    for (const slot of ALL_SLOTS) {
      const picked = selection[slot];
      if (!picked) continue;

      const set = this.setsById.get(picked.setId);
      if (!set) {
        warnings.push(`Unknown set "${picked.setId}" for slot "${slot}".`);
        continue;
      }

      const piece = set.pieces[slot];
      if (!piece) {
        warnings.push(`Set "${set.name}" has no data for slot "${slot}" (incomplete set?).`);
        continue;
      }

      let stats: ReturnType<typeof expandTierStats>;
      try {
        stats = expandTierStats(piece, picked.tier);
      } catch (err) {
        warnings.push(`Incomplete data for ${set.name} - ${piece.name} at Tier ${picked.tier}: ${(err as Error).message}`);
        continue;
      }

      result.totalArmorRating += stats.armorRating;
      result.penalties.movementPenaltyPct += stats.movementPenaltyPct;
      result.penalties.staminaPenaltyPct += stats.staminaPenaltyPct;

      result.slots[slot] = {
        setId: set.id,
        setName: set.name,
        pieceName: piece.name,
        itemId: piece.itemId,
        tier: picked.tier,
        armorRating: stats.armorRating,
      };

      for (const passive of piece.passives) {
        let value: number;
        try {
          value = progressionValue(passive.progression, picked.tier);
        } catch (err) {
          warnings.push(`Passive "${passive.key}" incomplete for ${set.name} - ${piece.name} (Tier ${picked.tier}): ${(err as Error).message}`);
          continue;
        }

        result.passives.push({
          slot,
          setId: set.id,
          setName: set.name,
          pieceName: piece.name,
          itemId: piece.itemId,
          tier: picked.tier,
          statKey: passive.key,
          statLabel: passive.label,
          value,
          unit: passive.unit,
          tags: passive.tags,
        });

        if (passive.key === NOISE_STAT_KEY) {
          noiseAccumulatorPct += value;
          hasNoiseData = true;
        }
      }

      const tierMaterials = piece.tierMaterials[picked.tier] ?? [];
      if (tierMaterials.length === 0) {
        warnings.push(`No materials defined for ${set.name} - ${piece.name} (Tier ${picked.tier}).`);
      }
      for (const mat of tierMaterials) {
        const existing = materialsByItem.get(mat.itemId);
        if (existing) {
          existing.quantity += mat.quantity;
        } else {
          materialsByItem.set(mat.itemId, { itemId: mat.itemId, name: mat.name, quantity: mat.quantity });
        }
      }
    }

    // Set bonus: agrupar por setId los slots equipados y comprobar si están las 4 piezas.
    const setIdsInBuild = new Set<string>();
    for (const slot of ALL_SLOTS) {
      const s = selection[slot];
      if (s) setIdsInBuild.add(s.setId);
    }

    for (const setId of setIdsInBuild) {
      const set = this.setsById.get(setId);
      if (!set) continue;

      const equippedTiers: Tier[] = [];
      for (const slot of ALL_SLOTS) {
        const picked = selection[slot];
        if (picked?.setId === setId && set.pieces[slot]) {
          equippedTiers.push(picked.tier);
        }
      }

      const active = equippedTiers.length === 4;
      const effectiveLevel: Tier | null = active ? (Math.min(...equippedTiers) as Tier) : null;

      const bonusResult: SetBonusResult = {
        setId: set.id,
        setName: set.name,
        piecesEquipped: equippedTiers.length,
        active,
        effectiveLevel,
        bonusName: set.setBonus.name,
        bonusDescription: set.setBonus.description,
        effect: active && effectiveLevel ? set.setBonus.levels[effectiveLevel] ?? null : null,
      };

      result.setBonuses.push(bonusResult);
    }

    result.materials = [...materialsByItem.values()].sort((a, b) => a.name.localeCompare(b.name));

    result.penalties.noiseIndex = hasNoiseData ? round1(noiseAccumulatorPct) : 0;
    result.penalties.noiseLabel = noiseLabel(result.penalties.noiseIndex);

    // Redondeo de salida para no arrastrar errores de coma flotante.
    result.totalArmorRating = round1(result.totalArmorRating);
    result.penalties.movementPenaltyPct = round1(result.penalties.movementPenaltyPct);
    result.penalties.staminaPenaltyPct = round1(result.penalties.staminaPenaltyPct);

    return result;
  }

  /** Utilidad de comparación: calcula dos builds y devuelve ambos resultados + diffs clave. */
  compare(a: BuildSelection, b: BuildSelection) {
    const resultA = this.calculate(a);
    const resultB = this.calculate(b);
    return {
      a: resultA,
      b: resultB,
      diff: {
        totalArmorRating: round1(resultB.totalArmorRating - resultA.totalArmorRating),
        movementPenaltyPct: round1(resultB.penalties.movementPenaltyPct - resultA.penalties.movementPenaltyPct),
        staminaPenaltyPct: round1(resultB.penalties.staminaPenaltyPct - resultA.penalties.staminaPenaltyPct),
        noiseIndex: round1(resultB.penalties.noiseIndex - resultA.penalties.noiseIndex),
      },
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
