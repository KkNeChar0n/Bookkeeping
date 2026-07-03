import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddSavingsEntry,
  useCards,
  useRemoveSavings,
  useRemoveSavingsEntry,
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
  const removeEntry = useRemoveSavingsEntry();
  const del = useRemoveSavings();

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

  // 表单
  const [amount, setAmount] = useState('');
  const [incAmt, setIncAmt] = useState('');
  const [incNote, setIncNote] = useState('');
  const [excAmt, setExcAmt] = useState('');
  const [excNote, setExcNote] = useState('');
  const [msg, setMsg] = useState('');

  // 切月/重新进入时，回显该月真实储蓄金额
  useEffect(() => {
    setAmount(existing ? existing.amount : '');
    setMsg('');
  }, [month, existing?.amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAll = async () => {
    setMsg('');
    if (!amount && !incAmt && !excAmt) return;
    if (amount) await setAmt.mutateAsync({ cardId: id, month, amount });
    if (incAmt) await addEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: incAmt, note: incNote || undefined });
    if (excAmt) await addEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excAmt, note: excNote || undefined });
    setIncAmt('');
    setIncNote('');
    setExcAmt('');
    setExcNote('');
    setMsg('已保存');
  };

  const saving = setAmt.isPending || addEntry.isPending;
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

      {/* 一个大卡片：月份 + 真实储蓄金额 + 本月收入 + 超额支出 + 一个保存按钮 */}
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

        <div className="field">
          <label>本月收入（可留空，可多次保存追加）</label>
          <div className="row-between" style={{ gap: 8 }}>
            <input type="number" step="0.01" placeholder="金额" value={incAmt} onChange={(e) => setIncAmt(e.target.value)} />
            <input placeholder="备注(可选)" value={incNote} onChange={(e) => setIncNote(e.target.value)} style={{ flex: 1 }} />
          </div>
        </div>

        <div className="field">
          <label>超额支出 · 额外充给消费卡的钱（可留空，可多次追加）</label>
          <div className="row-between" style={{ gap: 8 }}>
            <input type="number" step="0.01" placeholder="金额" value={excAmt} onChange={(e) => setExcAmt(e.target.value)} />
            <input placeholder="备注(可选)" value={excNote} onChange={(e) => setExcNote(e.target.value)} style={{ flex: 1 }} />
          </div>
        </div>

        <button
          className="primary"
          onClick={saveAll}
          disabled={saving || (!amount && !incAmt && !excAmt)}
        >
          保存
        </button>
        {msg && <div className="muted mt">{msg}</div>}
      </div>

      {/* 本月相关的所有储蓄修改 */}
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
                <div className="row-between">
                  <span className="amt neutral">{fmtMoney(existing.amount)}</span>
                  <button className="ghost" onClick={() => del.mutate(existing.id)}>
                    ✕
                  </button>
                </div>
              </div>
            )}
            {incomeEntries.map((e) => (
              <div className="tx" key={e.id}>
                <div>
                  <div>收入{e.note ? ` · ${e.note}` : ''}</div>
                </div>
                <div className="row-between">
                  <span className="amt in">+{fmtMoney(e.amount)}</span>
                  <button className="ghost" onClick={() => removeEntry.mutate(e.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {excessEntries.map((e) => (
              <div className="tx" key={e.id}>
                <div>
                  <div>超额支出{e.note ? ` · ${e.note}` : ''}</div>
                </div>
                <div className="row-between">
                  <span className="amt out">−{fmtMoney(e.amount)}</span>
                  <button className="ghost" onClick={() => removeEntry.mutate(e.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {card && (
        <CardManageBar cardId={id} name={card.name} initialBalance={card.initialBalance} showInitial onDeleted={() => navigate('/savings')} />
      )}
    </div>
  );
}
