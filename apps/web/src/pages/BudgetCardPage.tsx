import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBudgetCurrentMonth, useCards, useUpdateCard } from '../api/hooks';
import { addMonths, currentMonthStr, fmtMoney } from '../lib/format';

const KIND_LABEL: Record<'IN' | 'OUT' | 'EXPENSE', string> = {
  IN: '收入',
  OUT: '调出',
  EXPENSE: '支出',
};

export function BudgetCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const card = cards.data?.find((c) => c.id === id);
  const update = useUpdateCard();

  const [month, setMonth] = useState(currentMonthStr());
  const view = useBudgetCurrentMonth(id, month);
  const v = view.data;

  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);

  const editInitial = () => {
    const val = window.prompt('期初金额（预期余额的起点）', card?.initialBalance ?? '0');
    if (val !== null && val.trim() !== '') update.mutate({ id, initialBalance: val.trim() });
  };

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(-100, Math.min(100, dx)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    setDrag(0);
    if (Math.abs(dy) > Math.abs(dx) && dy < -60) {
      navigate(`/budget/${id}/edit?month=${month}`); // 上滑 → 收支调整
    } else if (dx > 50) {
      setMonth((m) => addMonths(m, -1)); // 右滑 → 上一月
    } else if (dx < -50) {
      setMonth((m) => addMonths(m, 1)); // 左滑 → 下一月
    }
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate('/budget')}>
          ‹ 预算
        </button>
        <div className="detail-title">
          <strong>{card?.name ?? '储蓄卡'}</strong>
          <span className="type-tag">预算</span>
        </div>
        <div className="detail-actions">
          <button className="mini" onClick={editInitial}>
            期初调整
          </button>
        </div>
      </div>

      <div
        className="swipe-card"
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div className="row-between" style={{ marginBottom: 6 }}>
          <button className="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMonth((m) => addMonths(m, -1))}>
            ‹
          </button>
          <strong style={{ fontSize: 18 }}>{month}</strong>
          <button className="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMonth((m) => addMonths(m, 1))}>
            ›
          </button>
        </div>
        <div className="swipe-balance">
          <span className="muted">预期余额</span>
          <div className="big">{v ? fmtMoney(v.expected) : '—'}</div>
          <div className="muted">期初 {card ? fmtMoney(card.initialBalance) : '—'}</div>
        </div>

        <div className="divider" />
        <div className="detail-sub">本月预算明细</div>
        {v && v.details.length ? (
          v.details.map((d) => (
            <div className="tx" key={d.id}>
              <div>
                <div>{d.label}</div>
                <div className="meta">
                  {KIND_LABEL[d.kind]}
                  {d.category && d.category !== d.label ? ` · ${d.category}` : ''}
                </div>
              </div>
              <span className={`amt ${d.kind === 'IN' ? 'in' : 'out'}`}>
                {d.kind === 'IN' ? '+' : '−'}
                {fmtMoney(d.amount)}
              </span>
            </div>
          ))
        ) : (
          <div className="muted">本月还没有预算明细</div>
        )}

        <div className="swipe-hint" style={{ marginTop: 14 }}>
          ‹ 右滑上一月 · 左滑下一月 › · 上滑 ↑ 记收支
        </div>
      </div>
    </div>
  );
}
