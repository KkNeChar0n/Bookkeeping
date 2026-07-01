import { useNavigate } from 'react-router-dom';
import { useCards } from '../api/hooks';

/** 储蓄卡叠放列表，点击进入 `${basePath}/${cardId}` */
export function SavingsStack({ basePath }: { basePath: string }) {
  const cards = useCards();
  const navigate = useNavigate();
  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS');

  if (!savings.length) {
    return <div className="card muted">还没有储蓄卡，去「卡片」页添加一张储蓄卡。</div>;
  }
  return (
    <div className="stack">
      {savings.map((c) => (
        <div key={c.id} className="stack-item" onClick={() => navigate(`${basePath}/${c.id}`)}>
          <div className="stack-head">
            <div className="stack-name">
              <span>{c.name}</span>
              <span className="type-tag">储蓄卡</span>
            </div>
            <span style={{ color: 'var(--primary)' }}>›</span>
          </div>
        </div>
      ))}
    </div>
  );
}
