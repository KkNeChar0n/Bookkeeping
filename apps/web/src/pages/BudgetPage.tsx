import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBudgetCurrentMonth, useCards } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';
import type { Card } from '../api/types';

export function BudgetPage() {
  const cards = useCards();
  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (savings.length && !savings.find((c) => c.id === openId)) setOpenId(savings[0].id);
  }, [savings, openId]);

  return (
    <div>
      <h1 className="page-title">预算</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        点开看本月预算，再点一次进入详情（左右滑切月、记收支）。
      </div>

      {savings.length ? (
        <div className="stack">
          {savings.map((c) => (
            <BudgetListItem
              key={c.id}
              card={c}
              open={openId === c.id}
              onOpen={() => setOpenId(c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card muted">还没有储蓄卡。去「储蓄」页添加。</div>
      )}
    </div>
  );
}

function BudgetListItem({ card, open, onOpen }: { card: Card; open: boolean; onOpen: () => void }) {
  const navigate = useNavigate();
  const month = currentMonthStr();
  const view = useBudgetCurrentMonth(open ? card.id : '', month);
  const v = view.data;

  const income = v ? v.details.filter((d) => d.kind === 'IN').reduce((s, d) => s + Number(d.amount), 0) : 0;
  const expense = v ? v.details.filter((d) => d.kind === 'EXPENSE').reduce((s, d) => s + Number(d.amount), 0) : 0;

  // 折叠→展开；已展开→进详情
  const onClick = () => (open ? navigate(`/budget/${card.id}`) : onOpen());

  return (
    <div className={`stack-item${open ? ' open' : ''}`} onClick={onClick}>
      <div className="stack-head">
        <div className="stack-name">
          <span>{card.name}</span>
          <span className="type-tag">储蓄卡</span>
        </div>
        <span className="muted">{open ? '再点进入 ›' : '▸'}</span>
      </div>
      {open && (
        <div className="card-detail">
          <div className="kv">
            <span>本月（{month}）预期收入</span>
            <span className="pos">{fmtMoney(income)}</span>
          </div>
          <div className="kv">
            <span>预期支出</span>
            <span className="neg">{fmtMoney(expense)}</span>
          </div>
          <div className="kv">
            <span>期初</span>
            <span>{fmtMoney(card.initialBalance)}</span>
          </div>
          <div className="kv">
            <span>预期余额</span>
            <b>{v ? fmtMoney(v.expected) : '—'}</b>
          </div>
        </div>
      )}
    </div>
  );
}
