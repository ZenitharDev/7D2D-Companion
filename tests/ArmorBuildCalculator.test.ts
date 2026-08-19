import { describe, expect, it } from 'vitest';
import { ArmorBuildCalculator } from '../src/lib/ArmorBuildCalculator.js';
import { loadArmorSets } from '../src/data/loadArmorSets.js';
import type { ArmorSetData, BuildSelection } from '../src/types.js';

const calculator = new ArmorBuildCalculator(loadArmorSets());

describe('ArmorBuildCalculator', () => {
  it('activa el set bonus solo cuando las 4 piezas son del mismo set', () => {
    const full: BuildSelection = {
      helmet: { setId: 'raider', tier: 3 },
      chest: { setId: 'raider', tier: 3 },
      gloves: { setId: 'raider', tier: 3 },
      boots: { setId: 'raider', tier: 3 },
    };
    const result = calculator.calculate(full);
    const bonus = result.setBonuses.find((b) => b.setId === 'raider');
    expect(bonus?.active).toBe(true);
    expect(bonus?.effectiveLevel).toBe(3);
  });

  it('el nivel del set bonus es el tier de la pieza de menor calidad', () => {
    const mixedTiers: BuildSelection = {
      helmet: { setId: 'raider', tier: 6 },
      chest: { setId: 'raider', tier: 6 },
      gloves: { setId: 'raider', tier: 6 },
      boots: { setId: 'raider', tier: 1 },
    };
    const result = calculator.calculate(mixedTiers);
    const bonus = result.setBonuses.find((b) => b.setId === 'raider');
    expect(bonus?.active).toBe(true);
    expect(bonus?.effectiveLevel).toBe(1);
  });

  it('no activa el set bonus si falta una pieza o son de sets distintos', () => {
    const mixedSets: BuildSelection = {
      helmet: { setId: 'assassin', tier: 6 },
      chest: { setId: 'preacher', tier: 6 },
      gloves: { setId: 'preacher', tier: 6 },
      boots: { setId: 'assassin', tier: 6 },
    };
    const result = calculator.calculate(mixedSets);
    for (const bonus of result.setBonuses) {
      expect(bonus.active).toBe(false);
    }
  });

  it('consolida materiales sumando cantidades del mismo recurso entre piezas', () => {
    const full: BuildSelection = {
      helmet: { setId: 'preacher', tier: 1 },
      chest: { setId: 'preacher', tier: 1 },
      gloves: { setId: 'preacher', tier: 1 },
      boots: { setId: 'preacher', tier: 1 },
    };
    const result = calculator.calculate(full);
    const cloth = result.materials.find((m) => m.itemId === 'resourceCloth');
    expect(cloth).toBeDefined();
    // 4 piezas a 5 de tela c/u en Tier 1 -> 20, no 5 (una sola pieza).
    expect(cloth!.quantity).toBeGreaterThan(5);
  });

  it('la armadura pesada da más armor rating que la ligera al mismo tier', () => {
    const light: BuildSelection = { chest: { setId: 'preacher', tier: 4 } };
    const heavy: BuildSelection = { chest: { setId: 'raider', tier: 4 } };
    const resultLight = calculator.calculate(light);
    const resultHeavy = calculator.calculate(heavy);
    expect(resultHeavy.totalArmorRating).toBeGreaterThan(resultLight.totalArmorRating);
  });

  it('reporta un warning si se selecciona un set inexistente', () => {
    const badBuild: BuildSelection = { helmet: { setId: 'no-existe', tier: 1 } };
    const result = calculator.calculate(badBuild);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('reporta un warning si el set no tiene datos para ese slot', () => {
    const setWithGap: ArmorSetData = {
      id: 'partial',
      name: 'Partial Set',
      class: 'light',
      setBonus: { name: 'X', description: 'X', levels: {} as never },
      pieces: {}, // sin ninguna pieza cargada todavía
    };
    const calc = new ArmorBuildCalculator([setWithGap]);
    const result = calc.calculate({ helmet: { setId: 'partial', tier: 1 } });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.totalArmorRating).toBe(0);
  });

  it('no crashea y reporta un warning si un tier extraído del juego real está incompleto', () => {
    // Simula el caso real del extractor: progresión "explicit" a la que le
    // falta un tier porque el item no matcheó para ese nivel de calidad.
    const calculatorWithGap = new ArmorBuildCalculator([
      {
        id: 'incomplete',
        name: 'Incomplete Set',
        class: 'light',
        setBonus: { name: 'X', description: 'X', levels: {} as never },
        pieces: {
          helmet: {
            itemId: 'x',
            name: 'X Helmet',
            slot: 'helmet',
            passives: [],
            progression: {
              armorRating: { kind: 'explicit', values: { 1: 5 } }, // sin tier 3
              movementPenaltyPct: { kind: 'explicit', values: { 1: 0 } },
              staminaPenaltyPct: { kind: 'explicit', values: { 1: 1 } },
            },
            tierMaterials: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
          },
        },
      },
    ]);

    const result = calculatorWithGap.calculate({ helmet: { setId: 'incomplete', tier: 3 } });
    expect(result.totalArmorRating).toBe(0);
    expect(result.warnings.some((w) => w.includes('Incomplete data'))).toBe(true);
  });
});
