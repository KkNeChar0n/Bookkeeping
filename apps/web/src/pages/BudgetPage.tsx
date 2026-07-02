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
        只有储蓄卡需要做预算。点开一张卡按月编辑预算细节。
      </div>

      {savings.length ? (
        <div className="stack">
          {savings.map((c) => (
            <BudgetRow
              key={c.id}
              card={c}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card muted">还没有储蓄卡。去「储蓄」页添加。</div>
      )}
    </div>
  );
}

function BudgetRow({ card, open, onToggle }: { card: Card; open: boolean; onToggle: () => void }) {
  const month = currentMonthStr();
  const view = useBudgetCurrentMonth(card.id, month);
  const navigate = useNavigate();
  const v = view.data;

  return (
    <div className={`stack-item${open ? ' open' : ''}`}>
      <div className="stack-head" onClick={onToggle}>
        <div className="stack-name">
          <span>{card.name}</span>
          <span className="type-tag">储蓄卡</span>
        </div>
        <div className="stack-nums">
          <span>{v ? fmtMoney(v.expected) : '—'}</span>
          <span className="muted">{open ? '▾' : '▸'}</span>
        </div>
      </div>

      {open && (
        <div className="card-detail">
          <div className="kv">
            <span>本月（{month}）预期余额</span>
            <b>{v ? fmtMoney(v.expected) : '—'}</b>
          </div>
          {v && v.details.length ? (
            v.details.map((d) => (
              <div className="kv" key={d.id}>
                <span className="muted">
                  {d.kind === 'IN' ? '收入' : d.kind === 'OUT' ? '调出' : '支出'} · {d.label}
                </span>
                <span className={d.kind === 'IN' ? 'pos' : 'neg'}>
                  {d.kind === 'IN' ? '+' : '−'}
                  {fmtMoney(d.amount)}
                </span>
              </div>
            ))
          ) : (
            <div className="muted">本月还没有预算细节</div>
          )}
          <button className="mini mt" onClick={() => navigate(`/budget/${card.id}`)}>
            收支
          </button>
        </div>
      )}
    </div>
  );
}
