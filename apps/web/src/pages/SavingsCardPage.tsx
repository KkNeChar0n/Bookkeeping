import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCards,
  useSavingsEntries,
  useSavingsList,
  useSetSavingsAmount,
  useSetSavingsEntry,
} from '../api/hooks';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';

export function SavingsCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const list = useSavingsList(id);
  const setAmt = useSetSavingsAmount();
  const setEntry = useSetSavingsEntry();

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());

  const rows = list.data ?? [];
  const existing = rows.find((r) => r.month === month);
  const prevRow = rows
    .filter((r) => r.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const delta = existing && prevRow ? Number(existing.amount) - Number(prevRow.amount) : null;

  const entries = useSavingsEntries(id, month);
  const incomeTotal = (entries.data ?? [])
    .filter((e) => e.kind === 'INCOME')
    .reduce((s, e) => s + Number(e.amount), 0);
  const excessTotal = (entries.data ?? [])
    .filter((e) => e.kind === 'EXCESS')
    .reduce((s, e) => s + Number(e.amount), 0);

  // 三个框：真实储蓄金额 / 本月收入 / 超额支出
  const [amount, setAmount] = useState('');
  const [income, setIncome] = useState('');
  const [excess, setExcess] = useState('');
  const [saving, setSaving] = useState(false);

  // 每次切月/重新进入，回显这三个框当前已保存的值（改了就是覆盖，不是累加）
  useEffect(() => {
    setAmount(existing ? existing.amount : '');
    setIncome(incomeTotal > 0 ? String(incomeTotal) : '');
    setExcess(excessTotal > 0 ? String(excessTotal) : '');
  }, [month, existing?.amount, incomeTotal, excessTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  // 一个按钮同时提交三个框的改动，然后返回
  const saveAll = async () => {
    setSaving(true);
    try {
      if (amount) await setAmt.mutateAsync({ cardId: id, month, amount });
      await setEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: income || '0' });
      await setEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excess || '0' });
      navigate('/savings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate('/savings')}>
          ‹ 储蓄
        </button>
        <div className="detail-title">
          <strong>{card?.name ?? '储蓄卡'}</strong>
          <span className="type-tag">储蓄</span>
        </div>
        <span style={{ width: 40 }} />
      </div>

      {/* 一个大卡片：月份 + 真实储蓄金额 + 本月收入 + 超额支出 + 保存并返回 */}
      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        <div className="field">
          <label>真实储蓄金额</label>
          <input
            type="number"
            step="0.01"
            placeholder="填写真实储蓄金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="field">
          <label>本月收入</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </div>

        <div className="field">
          <label>超额支出 · 额外充给消费卡的钱</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={excess}
            onChange={(e) => setExcess(e.target.value)}
          />
        </div>

        <button className="primary" onClick={saveAll} disabled={saving}>
          保存并返回
        </button>
      </div>

      {/* 本月已保存的记录（只读）：真实储蓄金额 / 本月收入 / 超额支出各改成了啥 */}
      <div className="section-title">{month} · 本月储蓄记录</div>
      <div className="card">
        {!existing && incomeTotal === 0 && excessTotal === 0 ? (
          <div className="muted">本月还没有记录</div>
        ) : (
          <>
            <div className="tx">
              <div>
                <div>真实储蓄金额</div>
                {existing && delta !== null && (
                  <div className="meta">
                    环比上一记录 <span className={delta >= 0 ? 'pos' : 'neg'}>{fmtSigned(delta)}</span>
                  </div>
                )}
              </div>
              <span className="amt neutral">{existing ? fmtMoney(existing.amount) : '未填'}</span>
            </div>
            <div className="tx">
              <div>本月收入</div>
              <span className="amt in">{incomeTotal > 0 ? `+${fmtMoney(incomeTotal)}` : '—'}</span>
            </div>
            <div className="tx">
              <div>超额支出</div>
              <span className="amt out">{excessTotal > 0 ? `−${fmtMoney(excessTotal)}` : '—'}</span>
            </div>
          </>
        )}
      </div>

      {card && (
        <CardManageBar cardId={id} name={card.name} initialBalance={card.initialBalance} showInitial onDeleted={() => navigate('/savings')} />
      )}
    </div>
  );
}
