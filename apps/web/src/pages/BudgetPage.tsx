import { useNavigate } from 'react-router-dom';
import { useBudgetCurrentMonth, useCards } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';
import type { Card } from '../api/types';

export function BudgetPage() {
  const cards = useCards();
  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS');

  return (
    <div>
      <h1 className="page-title">预算</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        点一张储蓄卡进入预算：左右滑切换月份，上滑记收支。
      </div>

      {savings.length ? (
        <div className="stack">
          {savings.map((c, i) => (
            <BudgetListItem key={c.id} card={c} preview={i === 0} />
          ))}
        </div>
      ) : (
        <div className="card muted">还没有储蓄卡。去「储蓄」页添加。</div>
      )}
    </div>
  );
}

function BudgetListItem({ card, preview }: { card: Card; preview: boolean }) {
  const navigate = useNavigate();
  const month = currentMonthStr();
  const view = useBudgetCurrentMonth(preview ? card.id : '', month);
  const v = view.data;

  return (
    <div className={`stack-item${preview ? ' open' : ''}`} onClick={() => navigate(`/budget/${card.id}`)}>
      <div className="stack-head">
        <div className="stack-name">
          <span>{card.name}</span>
          <span className="type-tag">储蓄卡</span>
        </div>
        <span style={{ color: 'var(--primary)' }}>›</span>
      </div>
      {preview && (
        <div className="card-detail">
          <div className="kv">
            <span>本月（{month}）预期余额</span>
            <b>{v ? fmtMoney(v.expected) : '—'}</b>
          </div>
          <div className="kv">
            <span className="muted">期初</span>
            <span>{fmtMoney(card.initialBalance)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
