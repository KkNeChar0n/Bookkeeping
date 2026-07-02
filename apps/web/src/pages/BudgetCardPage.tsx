import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddBudgetDetail,
  useBudgetCurrentMonth,
  useCards,
  useDeleteBudgetDetail,
  useUpdateCard,
} from '../api/hooks';
import { addMonths, currentMonthStr, fmtMoney } from '../lib/format';

const KIND_LABEL: Record<'IN' | 'OUT' | 'EXPENSE', string> = { IN: '收入', OUT: '调出', EXPENSE: '支出' };

export function BudgetCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const card = cards.data?.find((c) => c.id === id);
  const update = useUpdateCard();
  const addDetail = useAddBudgetDetail();
  const delDetail = useDeleteBudgetDetail();

  const [month, setMonth] = useState(currentMonthStr());
  const view = useBudgetCurrentMonth(id, month);
  const v = view.data;

  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const editInitial = () => {
    const val = window.prompt('期初金额（预期余额的起点）', card?.initialBalance ?? '0');
    if (val !== null && val.trim() !== '') update.mutate({ id, initialBalance: val.trim() });
  };
  const addTransfer = () => {
    const val = window.prompt(`${month} 调出金额（计划从本卡转出）`);
    if (val && Number(val) > 0) addDetail.mutate({ cardId: id, month, kind: 'OUT', label: '调出', amount: val });
  };

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (Math.abs(mx) > Math.abs(my)) setDrag(Math.max(-120, Math.min(120, mx)));
  };
  const onUp = (e: React.PointerEvent) => {
    setDragging(false);
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    start.current = null;
    setDrag(0);
    if (Math.abs(mx) >= Math.abs(my)) {
      if (mx > 45) setMonth((m) => addMonths(m, -1));
      else if (mx < -45) setMonth((m) => addMonths(m, 1));
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
        className="swipe-card fill"
        style={{ transform: `translateX(${drag}px)`, transition: dragging ? 'none' : undefined }}
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

        {/* 记收支 / 调出 按钮 */}
        <div className="row-between mt" style={{ gap: 8 }} onPointerDown={(e) => e.stopPropagation()}>
          <button className="primary" style={{ flex: 1 }} onClick={() => navigate(`/budget/${id}/edit?month=${month}`)}>
            记收支
          </button>
          <button style={{ flex: 1 }} onClick={addTransfer}>
            调出
          </button>
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
              <div className="row-between">
                <span className={`amt ${d.kind === 'IN' ? 'in' : 'out'}`}>
                  {d.kind === 'IN' ? '+' : '−'}
                  {fmtMoney(d.amount)}
                </span>
                <button className="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={() => delDetail.mutate(d.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">本月还没有预算明细</div>
        )}

        <div className="swipe-hint" style={{ marginTop: 'auto', paddingTop: 14 }}>
          ‹ 右滑上一月 · 左滑下一月 ›
        </div>
      </div>
    </div>
  );
}
