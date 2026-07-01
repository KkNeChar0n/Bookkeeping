import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCards, useRemoveSavings, useSavingsList, useSetSavingsAmount } from '../api/hooks';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtMoney } from '../lib/format';

export function SavingsCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const list = useSavingsList(id);
  const setAmt = useSetSavingsAmount();
  const del = useRemoveSavings();

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());
  const [amount, setAmount] = useState('');

  const submit = async () => {
    if (!amount) return;
    await setAmt.mutateAsync({ cardId: id, month, amount });
    setAmount('');
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <button className="ghost" onClick={() => navigate('/savings')}>
          ‹ 储蓄
        </button>
        <strong>
          {card?.name ?? '储蓄卡'}
          <span className="type-tag">储蓄</span>
        </strong>
        <span style={{ width: 40 }} />
      </div>

      <div className="card">
        <label className="muted" style={{ display: 'block', marginBottom: 6 }}>
          填写某月真实储蓄金额（同月覆盖）
        </label>
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label>真实储蓄金额</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="primary" onClick={submit} disabled={!amount || setAmt.isPending}>
          保存
        </button>
      </div>

      <div className="section-title">历史</div>
      <div className="card">
        {list.data?.length ? (
          list.data.map((r) => (
            <div className="tx" key={r.id}>
              <div>{r.month}</div>
              <div className="row-between">
                <span className="amt neutral">{fmtMoney(r.amount)}</span>
                <button className="ghost" onClick={() => del.mutate(r.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">还没有记录</div>
        )}
      </div>

      {card && (
        <CardManageBar
          cardId={id}
          name={card.name}
          initialBalance={card.initialBalance}
          showInitial
          onDeleted={() => navigate('/savings')}
        />
      )}
    </div>
  );
}
