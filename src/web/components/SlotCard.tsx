import type { ArmorSetData, ArmorSlot, Tier } from '../../types.js';
import ItemIcon from './ItemIcon.js';

type SlotValue = { setId: string; tier: Tier } | null;

interface PieceInfo {
  setId: string;
  setName: string;
  pieceName: string;
  itemId: string;
  tier: Tier;
  armorRating: number;
}

interface Props {
  slot: ArmorSlot;
  label: string;
  sets: ArmorSetData[];
  value: SlotValue;
  pieceInfo: PieceInfo | undefined;
  onChange: (next: SlotValue) => void;
}

const CLASS_LABEL: Record<string, string> = { light: 'Light', medium: 'Medium', heavy: 'Heavy' };

const TIERS: Tier[] = [1, 2, 3, 4, 5, 6];
// The game's own item-quality color ramp (Config/qualityinfo.xml): Junk -> Legendary.
const QUALITY: { color: string; name: string }[] = [
  { color: 'var(--q1)', name: 'Junk' },
  { color: 'var(--q2)', name: 'Common' },
  { color: 'var(--q3)', name: 'Uncommon' },
  { color: 'var(--q4)', name: 'Rare' },
  { color: 'var(--q5)', name: 'Epic' },
  { color: 'var(--q6)', name: 'Legendary' },
];

export default function SlotCard({ slot, label, sets, value, pieceInfo, onChange }: Props) {
  const selectedSet = value ? sets.find((s) => s.id === value.setId) : undefined;
  const selectedPiece = selectedSet?.pieces[slot];

  function handleSetChange(setId: string) {
    if (!setId) {
      onChange(null);
      return;
    }
    onChange({ setId, tier: value?.tier ?? 6 });
  }

  function handleTierChange(tier: number) {
    if (!value) return;
    onChange({ setId: value.setId, tier: tier as Tier });
  }

  return (
    <div className={`slot-card slot-card--${slot}`}>
      <div className="slot-card-header">
        <span className="slot-card-label">{label}</span>
        {selectedSet && <span className={`class-badge class-badge--${selectedSet.class}`}>{CLASS_LABEL[selectedSet.class]}</span>}
      </div>

      <div className="slot-icon-row">
        {pieceInfo ? (
          <ItemIcon itemId={pieceInfo.itemId} alt={pieceInfo.pieceName} size={48} />
        ) : (
          <div className="item-icon item-icon--placeholder" style={{ width: 48, height: 48 }} aria-hidden="true" />
        )}
        <select className="slot-select" value={value?.setId ?? ''} onChange={(e) => handleSetChange(e.target.value)}>
          <option value="">— None —</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.pieces[slot]}>
              {s.name}
              {!s.pieces[slot] ? ' (no data)' : ''}
            </option>
          ))}
        </select>
      </div>

      {value && (
        <div className="slot-tier">
          <div className="tier-label-row">
            <span>Quality</span>
            <b style={{ color: QUALITY[value.tier - 1]!.color }}>
              Tier {value.tier} · {QUALITY[value.tier - 1]!.name}
            </b>
          </div>
          <div className="tier-track" role="group" aria-label="Tier">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                className={t <= value.tier ? 'tier-seg on' : 'tier-seg'}
                style={t <= value.tier ? { background: QUALITY[t - 1]!.color } : undefined}
                onClick={() => handleTierChange(t)}
                aria-pressed={t === value.tier}
                aria-label={`Tier ${t} — ${QUALITY[t - 1]!.name}`}
              />
            ))}
          </div>
        </div>
      )}

      {pieceInfo && (
        <div className="slot-piece-info">
          <span className="slot-piece-name">{pieceInfo.pieceName}</span>
          <span className="slot-piece-armor">{pieceInfo.armorRating} armor</span>
        </div>
      )}

      {selectedPiece?.description && <p className="slot-piece-flavor">{selectedPiece.description}</p>}
    </div>
  );
}
