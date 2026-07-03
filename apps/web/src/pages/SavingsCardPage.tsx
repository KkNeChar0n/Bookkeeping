import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddSavingsEntry,
  useCards,
  useSavingsEntries,
  useSavingsList,
  useSetSavingsAmount,
} from '../api/hooks';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';

export function SavingsCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const list = useSavingsList(id);
  const setAmt = useSetSavingsAmount();
  const addEntry = useAddSavingsEntry();

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());

  const rows = list.data ?? [];
  const existing = rows.find((r) => r.month === month);
  const prevRow = rows
    .filter((r) => r.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const delta = existing && prevRow ? Number(existing.amount) - Number(prevRow.amount) : null;

  const entries = useSavingsEntries(id, month);
  const incomeEntries = (entries.data ?? []).filter((e) => e.kind === 'INCOME');
  const excessEntries = (entries.data ?? []).filter((e) => e.kind === 'EXCESS');

  const [amount, setAmount] = useState('');
  const [incAmt, setIncAmt] = useState('');
  const [excAmt, setExcAmt] = useState('');
  const [saving, setSaving] = useState(false);

  // 切月/重新进入时，回显该月真实储蓄金额
  useEffect(() => {
    setAmount(existing ? existing.amount : '');
  }, [month, existing?.amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const addIncome = async () => {
    if (!incAmt) return;
    await addEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: incAmt });
    setIncAmt('');
  };
  const addExcess = async () => {
    if (!excAmt) return;
    await addEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excAmt });
    setExcAmt('');
  };

  // 整页保存：真实金额 + 尚未点“添加”的收入/超额支出，一起提交，然后返回
  const saveAll = async () => {
    setSaving(true);
    try {
      if (amount) await setAmt.mutateAsync({ cardId: id, month, amount });
      if (incAmt) await addEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: incAmt });
      if (excAmt) await addEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excAmt });
      navigate('/savings');
    } finally {
      setSaving(false);
    }
  };

  const nothingThisMonth = !existing && incomeEntries.length === 0 && excessEntries.length === 0;

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

      {/* 一个大卡片：月份 + 真实储蓄金额 + 本月收入(添加) + 超额支出(添加) */}
      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        <div className="field">
          <label>真实储蓄金额{existing ? '（当前 ' + fmtMoney(existing.amount) + '）' : ''}</label>
          <input
            type="number"
            step="0.01"
            placeholder="填写真实储蓄金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="divider" />

        <div className="field" style={{ margin: 0 }}>
          <label>本月收入（可添加多笔）</label>
          <div className="row-between" style={{ gap: 8 }}>
            <input type="number" step="0.01" placeholder="金额" value={incAmt} onChange={(e) => setIncAmt(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button
              style={{ width: 'auto', padding: '11px 18px', whiteSpace: 'nowrap', flex: 'none' }}
              onClick={addIncome}
              disabled={!incAmt || addEntry.isPending}
            >
              添加
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="field" style={{ margin: 0 }}>
          <label>超额支出 · 额外充给消费卡的钱（可添加多笔）</label>
          <div className="row-between" style={{ gap: 8 }}>
            <input type="number" step="0.01" placeholder="金额" value={excAmt} onChange={(e) => setExcAmt(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button
              style={{ width: 'auto', padding: '11px 18px', whiteSpace: 'nowrap', flex: 'none' }}
              onClick={addExcess}
              disabled={!excAmt || addEntry.isPending}
            >
              添加
            </button>
          </div>
        </div>
      </div>

      {/* 本月相关的所有储蓄修改（只读记录） */}
      <div className="section-title">{month} · 本月储蓄相关修改</div>
      <div className="card">
        {nothingThisMonth ? (
          <div className="muted">本月还没有修改</div>
        ) : (
          <>
            {existing && (
              <div className="tx">
                <div>
                  <div>真实储蓄金额</div>
                  {delta !== null && (
                    <div className="meta">
                      环比上一记录 <span className={delta >= 0 ? 'pos' : 'neg'}>{fmtSigned(delta)}</span>
                    </div>
                  )}
                </div>
                <span className="amt neutral">{fmtMoney(existing.amount)}</span>
              </div>
            )}
            {incomeEntries.map((e) => (
              <div className="tx" key={e.id}>
                <div>收入{e.note ? ` · ${e.note}` : ''}</div>
                <span className="amt in">+{fmtMoney(e.amount)}</span>
              </div>
            ))}
            {excessEntries.map((e) => (
              <div className="tx" key={e.id}>
                <div>超额支出{e.note ? ` · ${e.note}` : ''}</div>
                <span className="amt out">−{fmtMoney(e.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <button className="primary" onClick={saveAll} disabled={saving}>
        保存并返回
      </button>

      {card && (
        <CardManageBar cardId={id} name={card.name} initialBalance={card.initialBalance} showInitial onDeleted={() => navigate('/savings')} />
      )}
    </div>
  );
}
