import { useNavigate } from 'react-router-dom';
import { useCards } from '../api/hooks';

export function BudgetPage() {
  const cards = useCards();
  const navigate = useNavigate();
  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS');

  return (
    <div>
      <h1 className="page-title">预算</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        点一张储蓄卡进入预算：左右滑切换月份，上滑记收支。
      </div>

      {savings.length ? (
        <div className="stack">
          {savings.map((c) => (
            <div key={c.id} className="stack-item" onClick={() => navigate(`/budget/${c.id}`)}>
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
      ) : (
        <div className="card muted">还没有储蓄卡。去「储蓄」页添加。</div>
      )}
    </div>
  );
}
