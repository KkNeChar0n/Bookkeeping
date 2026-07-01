import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddBudgetDetail,
  useBudgetMonths,
  useCards,
  useDeleteBudgetDetail,
} from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';
import type { BudgetMonthDTO } from '../services/budgetPlan.service';

export function BudgetCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const [extraMonths, setExtraMonths] = useState<string[]>([]);
  const [newMonth, setNewMonth] = useState(currentMonthStr());
  const months = useBudgetMonths(id, extraMonths);

  const card = cards.data?.find((c) => c.id === id);

  const addMonth = () => {
    if (newMonth && !extraMonths.includes(newMonth)) setExtraMonths((m) => [...m, newMonth]);
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <button className="ghost" onClick={() => navigate('/budget')}>
          ‹ 预算
        </button>
        <strong>
          {card?.name ?? '储蓄卡'}
          <span className="type-tag">预算</span>
        </strong>
        <span style={{ width: 40 }} />
      </div>

      <div className="card">
        <label className="muted" style={{ display: 'block', marginBottom: 6 }}>
          添加一个月份栏目
        </label>
        <div className="row-between">
          <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          <button onClick={addMonth}>添加月份</button>
        </div>
      </div>

      {months.data?.length ? (
        [...months.data].reverse().map((m) => <MonthSection key={m.month} cardId={id} m={m} />)
      ) : (
        <div className="card muted mt">还没有月份，先在上方添加一个月份。</div>
      )}
    </div>
  );
}

function MonthSection({ cardId, m }: { cardId: string; m: BudgetMonthDTO }) {
  const addDetail = useAddBudgetDetail();
  const delDetail = useDeleteBudgetDetail();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return;
    await addDetail.mutateAsync({ cardId, month: m.month, label, kind, amount });
    setLabel('');
    setAmount('');
  };

  return (
    <>
      <div className="section-title">
        {m.month} · 预期余额 {fmtMoney(m.expected)}
      </div>
      <div className="card">
        {m.details.length ? (
          m.details.map((d) => (
            <div className="tx" key={d.id}>
              <div>
                <div>{d.label}</div>
                <div className="meta">{d.kind === 'IN' ? '计划收入' : '计划调出'}</div>
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

        <div className="add-detail mt">
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={kind === 'IN' ? 'active' : ''} onClick={() => setKind('IN')}>
              收入
            </button>
            <button className={kind === 'OUT' ? 'active' : ''} onClick={() => setKind('OUT')}>
              调出
            </button>
          </div>
          <input
            placeholder="名目（如：工资 / 转投资）"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div className="row-between" style={{ gap: 8 }}>
            <input
              type="number"
              step="0.01"
              placeholder="金额"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="primary" style={{ width: 'auto', padding: '11px 18px' }} onClick={submit} disabled={!amount}>
              添加
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
