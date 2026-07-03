import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddSavingsLog,
  useCards,
  useSavingsEntries,
  useSavingsList,
  useSavingsLogs,
  useSetSavingsAmount,
  useSetSavingsEntry,
} from '../api/hooks';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtDateTime, fmtMoney } from '../lib/format';

const FIELD_LABEL = { AMOUNT: '真实储蓄金额', INCOME: '本月收入', EXCESS: '超额支出' } as const;

export function SavingsCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const list = useSavingsList(id);
  const setAmt = useSetSavingsAmount();
  const setEntry = useSetSavingsEntry();
  const addLog = useAddSavingsLog();

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());

  const rows = list.data ?? [];
  const existing = rows.find((r) => r.month === month);

  const entries = useSavingsEntries(id, month);
  const logs = useSavingsLogs(id, month);
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

  // 一个按钮同时提交三个框的改动；每项若真的变了就留一条带时间戳的流水，然后返回
  const saveAll = async () => {
    setSaving(true);
    try {
      const amtNew = amount === '' ? null : Number(amount);
      const amtOld = existing ? Number(existing.amount) : null;
      if (amtNew !== null && amtNew !== amtOld) {
        await addLog.mutateAsync({ cardId: id, month, field: 'AMOUNT', amount });
        await setAmt.mutateAsync({ cardId: id, month, amount });
      }
      const incNew = Number(income || 0);
      if (incNew !== incomeTotal) {
        await addLog.mutateAsync({ cardId: id, month, field: 'INCOME', amount: income || '0' });
        await setEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: income || '0' });
      }
      const excNew = Number(excess || 0);
      if (excNew !== excessTotal) {
        await addLog.mutateAsync({ cardId: id, month, field: 'EXCESS', amount: excess || '0' });
        await setEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excess || '0' });
      }
      navigate('/savings');
    } finally {
      setSaving(false);
    }
  };

  const logRows = logs.data ?? [];

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

      {/* 本月修改流水（只读）：每次把某项改成某值都留一条，带时间戳，最新在前 */}
      <div className="section-title">{month} · 修改流水</div>
      <div className="card">
        {logRows.length ? (
          logRows.map((l) => {
            const cleared = Number(l.amount) === 0 && l.field !== 'AMOUNT';
            const cls = l.field === 'INCOME' ? 'in' : l.field === 'EXCESS' ? 'out' : 'neutral';
            const sign = cleared ? '' : l.field === 'INCOME' ? '+' : l.field === 'EXCESS' ? '−' : '';
            return (
              <div className="tx" key={l.id}>
                <div>
                  <div>{FIELD_LABEL[l.field]}</div>
                  <div className="meta">{fmtDateTime(l.createdAt)}</div>
                </div>
                <span className={`amt ${cls}`}>{cleared ? '清空' : `${sign}${fmtMoney(l.amount)}`}</span>
              </div>
            );
          })
        ) : (
          <div className="muted">本月还没有修改</div>
        )}
      </div>

      {card && (
        <CardManageBar cardId={id} name={card.name} initialBalance={card.initialBalance} showInitial onDeleted={() => navigate('/savings')} />
      )}
    </div>
  );
}
