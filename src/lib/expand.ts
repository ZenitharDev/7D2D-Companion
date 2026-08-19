import type { ArmorPieceData, StatProgression, Tier } from '../types.js';
import { TIERS } from '../types.js';

export function progressionValue(p: StatProgression, tier: Tier): number {
  if (p.kind === 'explicit') {
    const value = p.values[tier];
    if (value === undefined) {
      throw new Error(`Explicit progression has no value for tier ${tier}. Available values: ${Object.keys(p.values).join(', ')}`);
    }
    return value;
  }
  const raw = p.base + p.growth * (tier - 1);
  const decimals = p.decimals ?? 0;
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

export interface ExpandedTierStats {
  armorRating: number;
  movementPenaltyPct: number;
  staminaPenaltyPct: number;
}

/** Expande la `progression` compacta de una pieza a valores concretos para un tier dado. */
export function expandTierStats(piece: ArmorPieceData, tier: Tier): ExpandedTierStats {
  return {
    armorRating: progressionValue(piece.progression.armorRating, tier),
    movementPenaltyPct: progressionValue(piece.progression.movementPenaltyPct, tier),
    staminaPenaltyPct: progressionValue(piece.progression.staminaPenaltyPct, tier),
  };
}

/** Devuelve la tabla completa Tier 1-6 expandida (útil para mostrar en UI / debug). */
export function expandAllTiers(piece: ArmorPieceData): Record<Tier, ExpandedTierStats> {
  const out = {} as Record<Tier, ExpandedTierStats>;
  for (const tier of TIERS) out[tier] = expandTierStats(piece, tier);
  return out;
}
