import { ArmorBuildCalculator } from './lib/ArmorBuildCalculator.js';
import { loadArmorSets } from './data/loadArmorSets.js';
import type { BuildSelection } from './types.js';

const calculator = new ArmorBuildCalculator(loadArmorSets());

// Example 1: full Raider set at Tier 4 (set bonus active, level 4).
const raiderT4: BuildSelection = {
  helmet: { setId: 'raider', tier: 4 },
  chest: { setId: 'raider', tier: 4 },
  gloves: { setId: 'raider', tier: 4 },
  boots: { setId: 'raider', tier: 4 },
};

// Example 2: same set but boots at Tier 2 (lower quality) ->
// the Set Bonus should still activate, but at the LOWEST level (2).
const raiderMixedTiers: BuildSelection = {
  helmet: { setId: 'raider', tier: 4 },
  chest: { setId: 'raider', tier: 4 },
  gloves: { setId: 'raider', tier: 4 },
  boots: { setId: 'raider', tier: 2 },
};

// Example 3: mixed sets (Assassin + Preacher) -> no set bonus active.
const mixedBuild: BuildSelection = {
  helmet: { setId: 'assassin', tier: 6 },
  chest: { setId: 'preacher', tier: 5 },
  gloves: { setId: 'preacher', tier: 6 },
  boots: { setId: 'assassin', tier: 6 },
};

function printResult(label: string, selection: BuildSelection) {
  const result = calculator.calculate(selection);
  console.log(`\n=== ${label} ===`);
  console.log('Total armor rating:', result.totalArmorRating);
  console.log('Penalties:', result.penalties);
  console.log('Passives:');
  for (const buff of result.passives) {
    const sign = buff.value >= 0 ? '+' : '';
    console.log(`  - [${buff.slot}] ${buff.pieceName} (T${buff.tier}): ${buff.statLabel} ${sign}${buff.value}${buff.unit}`);
  }
  console.log('Set Bonus:');
  for (const sb of result.setBonuses) {
    if (sb.active) {
      console.log(`  - ${sb.setName} (${sb.bonusName}) ACTIVE at level ${sb.effectiveLevel}: ${sb.effect?.effectDescription}`);
    } else {
      console.log(`  - ${sb.setName}: inactive (${sb.piecesEquipped}/4 pieces equipped)`);
    }
  }
  console.log('Required materials:');
  for (const mat of result.materials) {
    console.log(`  - ${mat.name} x${mat.quantity}`);
  }
  if (result.warnings.length) {
    console.log('Warnings:', result.warnings);
  }
}

printResult('Raider Tier 4 full set', raiderT4);
printResult('Raider Tier 4 with Tier 2 boots (bonus limited by the weakest piece)', raiderMixedTiers);
printResult('Assassin + Preacher mix (no set bonus)', mixedBuild);

const cmp = calculator.compare(raiderT4, raiderMixedTiers);
console.log('\n=== Comparison: Raider T4 vs Raider T4 (T2 boots) ===');
console.log(cmp.diff);
