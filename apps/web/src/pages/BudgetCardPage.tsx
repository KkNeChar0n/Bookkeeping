import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAddBudgetDetail, useBudgetMonths, useCards, useDeleteBudgetDetail } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';

const KIND_LABEL: Record<'IN' | 'OUT' | 'EXPENSE', string> = {
  IN: '计划收入',
  OUT: '计划调出',
  EXPENSE: '计划支出',
};

export function BudgetCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const card = cards.data?.find((c) => c.id === id);

  const [month, setMonth] = useState(currentMonthStr());
  const monthsQ = useBudgetMonths(id, [month]);
  const months = monthsQ.data ?? [];
  const cur = months.find((m) => m.month === month);

  const addDetail = useAddBudgetDetail();
  const delDetail = useDeleteBudgetDetail();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'IN' | 'OUT' | 'EXPENSE'>('IN');
  const [amount, setAmount] = useState('');

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return;
    await addDetail.mutateAsync({ cardId: id, month, label, kind, amount });
    setLabel('');
    setAmount('');
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
        <span style={{ width: 40 }} />
      </div>

      {/* 月份选择 */}
      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {/* 该月编辑 */}
      <div className="section-title">
        {month} · 预期余额 {cur ? fmtMoney(cur.expected) : '—'}
      </div>
      <div className="card">
        {cur && cur.details.length ? (
          cur.details.map((d) => (
            <div className="tx" key={d.id}>
              <div>
                <div>{d.label}</div>
                <div className="meta">{KIND_LABEL[d.kind]}</div>
              </div>
              <div className="row-between">
                <span className={`amt ${d.kind === 'IN' ? 'in' : 'out'}`}>
                  {d.kind === 'IN' ? '+' : '−'}
                  {fmtMoney(d.amount)}
                </span>
                <button className="ghost" onClick={() => delDetail.mutate(d.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">本月还没有预算细节</div>
        )}

        <div className="mt">
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={kind === 'IN' ? 'active' : ''} onClick={() => setKind('IN')}>
              收入
            </button>
            <button className={kind === 'OUT' ? 'active' : ''} onClick={() => setKind('OUT')}>
              调出
            </button>
            <button className={kind === 'EXPENSE' ? 'active' : ''} onClick={() => setKind('EXPENSE')}>
              支出
            </button>
          </div>
          <input
            placeholder="备注（如：工资 / 转投资 / 房租）"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div className="row-between" style={{ gap: 8 }}>
            <input type="number" step="0.01" placeholder="金额" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button
              className="primary"
              style={{ width: 'auto', padding: '11px 18px', whiteSpace: 'nowrap' }}
              onClick={submit}
              disabled={!amount}
            >
              添加
            </button>
          </div>
        </div>
      </div>

      {/* 历史（点选切换月份） */}
      {months.length > 0 && (
        <>
          <div className="section-title">各月预期</div>
          <div className="card">
            {[...months].reverse().map((m) => (
              <div
                className={`tx${m.month === month ? ' picked' : ''}`}
                key={m.month}
                onClick={() => setMonth(m.month)}
                style={{ cursor: 'pointer' }}
              >
                <div>{m.month}</div>
                <span className="amt neutral">{fmtMoney(m.expected)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
