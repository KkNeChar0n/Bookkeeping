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
  const del = useRemoveSavings();

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());
  const [amount, setAmount] = useState('');

  const rows = list.data ?? [];
  const existing = rows.find((r) => r.month === month);
  const entries = useSavingsEntries(id, month);

  useEffect(() => {
    setAmount(existing ? existing.amount : '');
  }, [month, existing?.amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!amount) return;
    await setAmt.mutateAsync({ cardId: id, month, amount });
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

      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div className="section-title">{month} · 真实储蓄金额{existing ? '（覆盖已有）' : ''}</div>
      <div className="card">
        <div className="row-between" style={{ gap: 8 }}>
          <input type="number" step="0.01" placeholder="填写真实储蓄金额" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button
            className="primary"
            style={{ width: 'auto', padding: '11px 18px', whiteSpace: 'nowrap' }}
            onClick={submit}
            disabled={!amount || setAmt.isPending}
          >
            保存
          </button>
        </div>
      </div>

      <EntrySection cardId={id} month={month} kind="INCOME" title="本月收入" data={entries.data ?? []} />
      <EntrySection cardId={id} month={month} kind="EXCESS" title="超额支出（额外充给消费卡的钱）" data={entries.data ?? []} />

      {/* 历史储蓄余额 */}
      {rows.length > 0 && (
        <>
          <div className="section-title">各月储蓄余额</div>
          <div className="card">
            {rows.map((r, i) => {
              const prev = rows[i + 1];
              const delta = prev ? Number(r.amount) - Number(prev.amount) : null;
              return (
                <div className="tx" key={r.id}>
                  <div onClick={() => setMonth(r.month)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div>{r.month}</div>
                    {delta !== null && (
                      <div className="meta">
                        环比 <span className={delta >= 0 ? 'pos' : 'neg'}>{fmtSigned(delta)}</span>
                      </div>
                    )}
                  </div>
                  <div className="row-between">
                    <span className="amt neutral">{fmtMoney(r.amount)}</span>
                    <button className="ghost" onClick={() => del.mutate(r.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {card && (
        <CardManageBar cardId={id} name={card.name} initialBalance={card.initialBalance} showInitial onDeleted={() => navigate('/savings')} />
      )}
    </div>
  );
}

function EntrySection({
  cardId,
  month,
  kind,
  title,
  data,
}: {
  cardId: string;
  month: string;
  kind: 'INCOME' | 'EXCESS';
  title: string;
  data: { id: string; kind: string; amount: string; note: string | null }[];
}) {
  const add = useAddSavingsEntry();
  const remove = useRemoveSavingsEntry();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const rows = data.filter((d) => d.kind === kind);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  const submit = async () => {
    if (!amount) return;
    await add.mutateAsync({ cardId, month, kind, amount, note: note || undefined });
    setAmount('');
    setNote('');
  };

  return (
    <>
      <div className="section-title">
        {title} · 合计 {fmtMoney(total)}
      </div>
      <div className="card">
        {rows.length ? (
          rows.map((r) => (
            <div className="tx" key={r.id}>
              <div>
                <div>{fmtMoney(r.amount)}</div>
                {r.note ? <div className="meta">{r.note}</div> : null}
              </div>
              <button className="ghost" onClick={() => remove.mutate(r.id)}>
                ✕
              </button>
            </div>
          ))
        ) : (
          <div className="muted">还没有记录</div>
        )}
        <div className="row-between mt" style={{ gap: 8 }}>
          <input type="number" step="0.01" placeholder="金额" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input placeholder="备注(可选)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <button style={{ width: 'auto', padding: '11px 16px', whiteSpace: 'nowrap' }} onClick={submit} disabled={!amount}>
            添加
          </button>
        </div>
      </div>
    </>
  );
}
