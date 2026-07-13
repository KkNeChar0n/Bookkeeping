import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useBudgetCurrentMonth,
  useBudgetTransfer,
  useCards,
  useDeleteBudgetDetail,
  useUpdateCard,
} from '../api/hooks';
import { addMonths, currentMonthStr, fmtMoney } from '../lib/format';
import { useCardSlide } from '../lib/useCardSlide';

const KIND_LABEL: Record<'IN' | 'OUT' | 'EXPENSE' | 'TRANSFER_IN', string> = {
  IN: '收入',
  OUT: '调出',
  EXPENSE: '支出',
  TRANSFER_IN: '调入',
};

export function BudgetCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const card = cards.data?.find((c) => c.id === id);
  const update = useUpdateCard();
  const budgetTransfer = useBudgetTransfer();
  const delDetail = useDeleteBudgetDetail();

  const [month, setMonth] = useState(currentMonthStr());
  const view = useBudgetCurrentMonth(id, month);
  const v = view.data;

  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS' && c.id !== id);
  const [showTransfer, setShowTransfer] = useState(false);
  const [peer, setPeer] = useState('');
  const [tAmt, setTAmt] = useState('');

  // 整片左右滑动切月（与记账页同一套 hook：外层稳定容器挂 handlers，内层滑动）
  const { drag, instant, handlers, onClickCapture } = useCardSlide((dir) =>
    setMonth((m) => addMonths(m, dir)),
  );

  const editInitial = () => {
    const val = window.prompt('期初金额（预期余额的起点）', card?.initialBalance ?? '0');
    if (val !== null && val.trim() !== '') update.mutate({ id, initialBalance: val.trim() });
  };
  const doTransfer = async () => {
    if (!peer || !tAmt) return;
    await budgetTransfer.mutateAsync({ cardId: id, peerCardId: peer, month, amount: tAmt });
    setTAmt('');
    setPeer('');
    setShowTransfer(false);
  };

  return (
    <div className="detail-page">
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

      <div className="budget-swipe" {...handlers} onClickCapture={onClickCapture}>
        <div
          className="swipe-card fill"
          style={{ transform: `translateX(${drag}px)`, transition: instant ? 'none' : undefined }}
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
          <button style={{ flex: 1 }} onClick={() => setShowTransfer((s) => !s)}>
            调出
          </button>
        </div>
        {showTransfer && (
          <div className="card mt" onPointerDown={(e) => e.stopPropagation()}>
            <div className="field">
              <label>调出到（另一张储蓄卡）</label>
              <select value={peer} onChange={(e) => setPeer(e.target.value)}>
                <option value="">选择储蓄卡</option>
                {savings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-between" style={{ gap: 8 }}>
              <input type="number" step="0.01" placeholder="金额" value={tAmt} onChange={(e) => setTAmt(e.target.value)} />
              <button
                className="primary"
                style={{ width: 'auto', padding: '11px 18px', whiteSpace: 'nowrap' }}
                onClick={doTransfer}
                disabled={!peer || !tAmt}
              >
                确定
              </button>
            </div>
            <div className="muted mt">对方卡的 {month} 会自动生成一条「调入」。</div>
          </div>
        )}

        <div className="divider" />
        <div className="detail-sub">本月预算明细</div>
        <div className="detail-flow">
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
                  <span className={`amt ${d.kind === 'IN' || d.kind === 'TRANSFER_IN' ? 'in' : 'out'}`}>
                    {d.kind === 'IN' || d.kind === 'TRANSFER_IN' ? '+' : '−'}
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
        </div>

        <div className="swipe-hint" style={{ paddingTop: 14 }}>
          ‹ 右滑上一月 · 左滑下一月 ›
        </div>
        </div>
      </div>
    </div>
  );
}
