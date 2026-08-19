import { useMemo, useState } from 'react';
import { ArmorBuildCalculator } from '../lib/ArmorBuildCalculator.js';
import { loadArmorSets } from '../data/loadArmorSets.js';
import type { ArmorSlot, BuildSelection, Tier } from '../types.js';
import SlotCard from './components/SlotCard.js';
import ResultsPanel from './components/ResultsPanel.js';
import { trackEvent } from './analytics.js';

const SLOTS: { slot: ArmorSlot; label: string }[] = [
  { slot: 'helmet', label: 'Helmet' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'gloves', label: 'Gloves' },
  { slot: 'boots', label: 'Boots' },
];

type SlotValue = { setId: string; tier: Tier } | null;
type SelectionState = Record<ArmorSlot, SlotValue>;

const EMPTY_SELECTION: SelectionState = { helmet: null, chest: null, gloves: null, boots: null };

const calculator = new ArmorBuildCalculator(loadArmorSets());

export default function App() {
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);

  const sets = useMemo(() => [...calculator.listSets()].sort((a, b) => a.name.localeCompare(b.name)), []);

  const buildSelection: BuildSelection = useMemo(() => {
    const out: BuildSelection = {};
    for (const { slot } of SLOTS) {
      const v = selection[slot];
      if (v) out[slot] = v;
    }
    return out;
  }, [selection]);

  const result = useMemo(() => calculator.calculate(buildSelection), [buildSelection]);

  function updateSlot(slot: ArmorSlot, next: SlotValue) {
    setSelection((prev) => ({ ...prev, [slot]: next }));
  }

  function applySetToAllSlots(setId: string) {
    const set = sets.find((s) => s.id === setId);
    trackEvent('select_armor_set', { set_id: setId, set_name: set?.name ?? setId, class: set?.class ?? 'unknown', slot: 'all', method: 'quick_equip' });
    setSelection(() => {
      const next = { ...EMPTY_SELECTION };
      for (const { slot } of SLOTS) next[slot] = { setId, tier: 6 };
      return next;
    });
  }

  function clearAll() {
    trackEvent('clear_loadout');
    setSelection(EMPTY_SELECTION);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>7 Days to Die — Armor Calculator</h1>
        <p className="app-subtitle">
          Pick a set and its quality (Tier 1-6) for each slot. Data for all 15 sets is extracted directly from the
          game.
        </p>
      </header>

      <div className="toolbar">
        <label className="toolbar-select">
          Equip full set (Tier 6):
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applySetToAllSlots(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              — choose set —
            </option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.class})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-clear" onClick={clearAll}>
          Clear loadout
        </button>
      </div>

      <main className="layout">
        <section className="slots">
          {SLOTS.map(({ slot, label }) => (
            <SlotCard
              key={slot}
              slot={slot}
              label={label}
              sets={sets}
              value={selection[slot]}
              pieceInfo={result.slots[slot]}
              onChange={(next) => updateSlot(slot, next)}
            />
          ))}
        </section>

        <ResultsPanel result={result} />
      </main>

      <footer className="app-footer">
        Data extracted from the game's <code>Data/Config</code> (items.xml, recipes.xml, buffs.xml). See the project
        README to re-extract after a game update.
      </footer>
    </div>
  );
}
