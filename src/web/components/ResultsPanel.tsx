import type { ArmorBuildResult, BuffEntry } from '../../types.js';
import ItemIcon from './ItemIcon.js';

interface Props {
  result: ArmorBuildResult;
}

function fmtSigned(n: number, unit = ''): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}${unit}`;
}

interface PieceGroup {
  key: string;
  itemId: string;
  pieceName: string;
  tier: number;
  entries: BuffEntry[];
}

/** Groups by piece: a flat table read as if "3 rows of Commando Helmet" meant 3 different helmets, when it's really 1 helmet with 3 bonuses. */
function groupPassivesByPiece(passives: BuffEntry[]): PieceGroup[] {
  const groups: PieceGroup[] = [];
  const bySlot = new Map<string, PieceGroup>();
  for (const p of passives) {
    let group = bySlot.get(p.slot);
    if (!group) {
      group = { key: p.slot, itemId: p.itemId, pieceName: p.pieceName, tier: p.tier, entries: [] };
      bySlot.set(p.slot, group);
      groups.push(group);
    }
    group.entries.push(p);
  }
  return groups;
}

export default function ResultsPanel({ result }: Props) {
  const activeSetBonuses = result.setBonuses.filter((sb) => sb.piecesEquipped > 0);
  const hasAnyPiece = Object.keys(result.slots).length > 0;

  return (
    <section className="results">
      <div className="stat-grid">
        <div className="stat-card stat-card--primary">
          <span className="stat-label">Armor Rating</span>
          <span className="stat-value">{result.totalArmorRating}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Mobility</span>
          <span className="stat-value">{fmtSigned(result.penalties.movementPenaltyPct, '%')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Stamina</span>
          <span className="stat-value">{fmtSigned(result.penalties.staminaPenaltyPct, '%')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Noise</span>
          <span className="stat-value stat-value--text">{result.penalties.noiseLabel}</span>
          <span className="stat-sub">{fmtSigned(result.penalties.noiseIndex, '%')}</span>
        </div>
      </div>

      {!hasAnyPiece && <p className="empty-hint">Pick at least one piece to see the results.</p>}

      {activeSetBonuses.length > 0 && (
        <div className="panel-block">
          <h2>Set Bonus</h2>
          <ul className="set-bonus-list">
            {activeSetBonuses.map((sb) => (
              <li key={sb.setId} className={sb.active ? 'set-bonus set-bonus--active' : 'set-bonus'}>
                <div className="set-bonus-title">
                  <span>{sb.setName}</span>
                  <span className={sb.active ? 'set-bonus-status set-bonus-status--active' : 'set-bonus-status'}>
                    {sb.active ? `ACTIVE · level ${sb.effectiveLevel}` : `${sb.piecesEquipped}/4 pieces`}
                  </span>
                </div>
                {sb.active && sb.effect && <p className="set-bonus-desc">{sb.effect.effectDescription}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.passives.length > 0 && (
        <div className="panel-block">
          <h2>Passives</h2>
          <div className="passive-groups">
            {groupPassivesByPiece(result.passives).map((g) => (
              <div className="passive-group" key={g.key}>
                <div className="passive-group-header">
                  <ItemIcon itemId={g.itemId} alt={g.pieceName} size={32} />
                  <span className="passive-group-name">{g.pieceName}</span>
                  <span className="passive-group-tier">Tier {g.tier}</span>
                </div>
                <ul className="passive-stat-list">
                  {g.entries.map((e, i) => (
                    <li key={i}>
                      <span>{e.statLabel}</span>
                      <span className={e.value >= 0 ? 'value-positive' : 'value-negative'}>
                        {fmtSigned(e.value, e.unit === '%' ? '%' : '')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.materials.length > 0 && (
        <div className="panel-block">
          <h2>Crafting materials</h2>
          <table className="data-table data-table--icons">
            <thead>
              <tr>
                <th></th>
                <th>Material</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {result.materials.map((m) => (
                <tr key={m.itemId}>
                  <td>
                    <ItemIcon itemId={m.itemId} alt={m.name} size={28} />
                  </td>
                  <td>{m.name}</td>
                  <td>{m.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="panel-block panel-block--warning">
          <h2>Warnings</h2>
          <ul className="warning-list">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
