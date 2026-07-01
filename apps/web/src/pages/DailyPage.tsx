import { useEffect, useMemo, useState } from 'react';
import {
  useCards,
  useCategories,
  useComparison,
  useCreateEntry,
  useDeleteTransaction,
  useSetBalance,
  useTransactions,
  useTransfer,
} from '../api/hooks';
import { ComparisonCards } from '../components/ComparisonCards';
import { fmtMoney, todayStr } from '../lib/format';
import type { Transaction } from '../api/types';

type Mode = 'OUT' | 'IN' | 'TRANSFER' | 'BALANCE';

export function DailyPage() {
  const cards = useCards();
  const categories = useCategories();
  const comparison = useComparison();
  const recent = useTransactions();

  const createEntry = useCreateEntry();
  const transfer = useTransfer();
  const setBalance = useSetBalance();
  const del = useDeleteTransaction();

  const [mode, setMode] = useState<Mode>('OUT');
  const [cardId, setCardId] = useState('');
  const [peerCardId, setPeerCardId] = useState('');
  const [direction, setDirection] = useState<'OUT' | 'IN'>('OUT');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());
  const [msg, setMsg] = useState('');

  // 默认选中默认卡
  useEffect(() => {
    if (!cardId && cards.data?.length) {
      const def = cards.data.find((c) => c.isDefault) ?? cards.data[0];
      setCardId(def.id);
    }
  }, [cards.data, cardId]);

  const catList = useMemo(() => {
    if (mode === 'IN') return categories.data?.income ?? [];
    if (mode === 'OUT') return categories.data?.expense ?? [];
    return [];
  }, [mode, categories.data]);

  const reset = () => {
    setAmount('');
    setNote('');
    setCategory('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      if (mode === 'IN' || mode === 'OUT') {
        await createEntry.mutateAsync({ cardId, type: mode, amount, date, category: category || undefined, note: note || undefined });
        setMsg('已记录');
      } else if (mode === 'TRANSFER') {
        await transfer.mutateAsync({ cardId, direction, peerCardId, amount, date, note: note || undefined });
        setMsg('调账完成');
      } else {
        const r = await setBalance.mutateAsync({ cardId, targetBalance: amount, date, note: note || undefined });
        setMsg((r as { adjusted?: boolean }).adjusted ? '余额已调整（已留痕）' : '余额无变化');
      }
      reset();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '提交失败');
    }
  };

  const cardName = (id: string | null) => cards.data?.find((c) => c.id === id)?.name ?? '—';
  const pending = createEntry.isPending || transfer.isPending || setBalance.isPending;

  const amtClass = (t: Transaction) =>
    t.type === 'IN' ? 'in' : t.type === 'OUT' ? 'out' : 'neutral';
  const typeLabel = (t: Transaction) =>
    t.type === 'IN' ? '收入' : t.type === 'OUT' ? '支出' : t.type === 'TRANSFER' ? '调账' : '调整';

  return (
    <div>
      <h1 className="page-title">当日记账</h1>

      {comparison.data && <ComparisonCards data={comparison.data} />}

      <div className="section-title">记一笔</div>
      <form className="card" onSubmit={submit}>
        <div className="seg" style={{ marginBottom: 12 }}>
          {(['OUT', 'IN', 'TRANSFER', 'BALANCE'] as Mode[]).map((m) => (
            <button
              type="button"
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setMsg('');
              }}
            >
              {m === 'OUT' ? '支出' : m === 'IN' ? '收入' : m === 'TRANSFER' ? '调账' : '改余额'}
            </button>
          ))}
        </div>

        <div className="field">
          <label>{mode === 'TRANSFER' ? '当前卡' : '卡片'}</label>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cards.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDefault ? '（默认）' : ''}
              </option>
            ))}
          </select>
        </div>

        {mode === 'TRANSFER' && (
          <>
            <div className="field">
              <label>方向</label>
              <div className="seg">
                <button type="button" className={direction === 'OUT' ? 'active' : ''} onClick={() => setDirection('OUT')}>
                  调出
                </button>
                <button type="button" className={direction === 'IN' ? 'active' : ''} onClick={() => setDirection('IN')}>
                  调入
                </button>
              </div>
            </div>
            <div className="field">
              <label>{direction === 'OUT' ? '调出到' : '从该卡调入'}</label>
              <select value={peerCardId} onChange={(e) => setPeerCardId(e.target.value)}>
                <option value="">请选择对手卡</option>
                {cards.data
                  ?.filter((c) => c.id !== cardId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}

        {(mode === 'IN' || mode === 'OUT') && (
          <div className="field">
            <label>类型</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">未分类</option>
              {catList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>{mode === 'BALANCE' ? '目标余额' : '金额'}</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="field">
          <label>日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label>备注{mode === 'BALANCE' ? '（如：利息）' : ''}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
        </div>

        <button className="primary" type="submit" disabled={pending || !cardId || !amount || (mode === 'TRANSFER' && !peerCardId)}>
          {pending ? '提交中…' : '提交'}
        </button>
        {msg && <div className="muted mt">{msg}</div>}
      </form>

      <div className="section-title">最近流水</div>
      <div className="card">
        {recent.data?.length ? (
          recent.data.slice(0, 30).map((t) => (
            <div className="tx" key={t.id}>
              <div>
                <div>
                  {typeLabel(t)}
                  {t.category ? ` · ${t.category}` : ''}
                  {t.type === 'TRANSFER' ? ` · ${cardName(t.cardId)}→${cardName(t.peerCardId)}` : ` · ${cardName(t.cardId)}`}
                </div>
                <div className="meta">
                  {t.date}
                  {t.note ? ` · ${t.note}` : ''}
                </div>
              </div>
              <div className="row-between">
                <span className={`amt ${amtClass(t)}`}>{fmtMoney(t.amount)}</span>
                <button className="ghost" onClick={() => del.mutate(t.id)} aria-label="删除">
                  ✕
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">暂无流水</div>
        )}
      </div>
    </div>
  );
}
