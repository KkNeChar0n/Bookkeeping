import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useCategories,
  useCreateEntry,
  useDeleteTransaction,
  useSpendMonth,
  useTransactions,
  useUpdateTransaction,
} from '../api/hooks';
import type { Transaction } from '../api/types';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { fmtMoney, todayStr } from '../lib/format';

const stop = (event: React.PointerEvent) => event.stopPropagation();

export function ConsumptionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || todayStr());
  const month = date.slice(0, 7);
  const view = useSpendMonth(month);
  const categories = useCategories();
  const createEntry = useCreateEntry();
  const transactions = useTransactions({ cardId: VIRTUAL_CONSUMPTION_CARD_ID });
  const [openId, setOpenId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const startX = useRef<number | null>(null);
  const dragRef = useRef(0);
  const gestureRef = useRef(false);
  const submittingRef = useRef(false);

  const reset = () => {
    setArmed(false);
    setAmount('');
    setCategory('');
    setNote('');
    setDrag(0);
  };
  const submit = async () => {
    if (submittingRef.current) return;
    if (!category) return setMessage('请先选择类型');
    if (!amount || Number(amount) <= 0) return setMessage('请先填写金额');
    submittingRef.current = true;
    try {
      await createEntry.mutateAsync({
        cardId: VIRTUAL_CONSUMPTION_CARD_ID,
        type: 'OUT',
        amount,
        date,
        category,
        note: note || undefined,
      });
      setMessage('已记支出');
      reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败');
    } finally {
      submittingRef.current = false;
    }
  };
  const onPointerDown = (event: React.PointerEvent) => {
    startX.current = event.clientX;
    dragRef.current = 0;
    gestureRef.current = true;
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!gestureRef.current || startX.current === null) return;
    const next = Math.max(-120, Math.min(0, event.clientX - startX.current));
    dragRef.current = next;
    setDrag(next);
  };
  const onPointerUp = () => {
    if (!gestureRef.current) return;
    gestureRef.current = false;
    const moved = dragRef.current;
    startX.current = null;
    dragRef.current = 0;
    setDrag(0);
    if (moved >= -70) return;
    if (armed) void submit();
    else setArmed(true);
  };

  const current = view.data;
  const remaining = Number(current?.remaining ?? 0);
  const rows = (transactions.data ?? []).filter((row) => row.date === date);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <h1 className="page-title" style={{ margin: 0 }}>记账</h1>
        <button className="ghost" aria-label="设置" onClick={() => navigate('/settings')}>⚙️</button>
      </div>
      <div
        className={`swipe-card ${armed ? 'expense' : ''}`}
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div onPointerDown={stop}>
          <div className="field" style={{ margin: 0 }}>
            <label>记账日期（额度按所选日期的月份）</label>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="muted mt" style={{ fontSize: 12 }}>
            {month} 全局消费额度 {current?.hasQuota ? fmtMoney(current.quota) : '未设'} · 来自当月所有储蓄卡预算之和
          </div>
        </div>

        <div className="divider" />
        <div className="swipe-balance">
          <span className="muted">本月剩余</span>
          <div className={`big ${remaining < 0 ? 'neg' : ''}`}>{fmtMoney(remaining)}</div>
          <div className="muted">
            预算 {current?.hasQuota ? fmtMoney(current.quota) : '未设'} · 超额充值 {fmtMoney(current?.excess ?? '0')} · 已消费 {fmtMoney(current?.spent ?? '0')}
            {Number(current?.overspend ?? 0) > 0 ? ` · 超支 ${fmtMoney(current?.overspend ?? '0')}` : ''}
          </div>
        </div>

        {armed && (
          <div className="swipe-form" onPointerDown={stop}>
            <div className="chips">
              {(categories.data?.expense ?? []).map((value) => (
                <button key={value} className={`chip${category === value ? ' active' : ''}`} onClick={() => setCategory(value)}>
                  {value}
                </button>
              ))}
            </div>
            <input type="number" inputMode="decimal" step="0.01" placeholder="金额" value={amount} autoFocus onChange={(event) => setAmount(event.target.value)} style={{ marginBottom: 8 }} />
            <input placeholder="备注（可选）" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        )}
        <div className="swipe-hint expense">{armed ? '← 选类型、填金额后，再次左滑确认' : '← 在此区域左滑记一笔消费'}</div>

        <div className="divider" />
        <div className="detail-sub">当日流水（{date}，点一笔可改）</div>
        {rows.length ? rows.map((row) => (
          <ConsumptionTxRow
            key={row.id}
            transaction={row}
            categories={categories.data?.expense ?? []}
            open={openId === row.id}
            onOpen={() => setOpenId(row.id)}
            onClose={() => setOpenId(null)}
          />
        )) : <div className="muted">当日暂无流水</div>}
      </div>
      {armed && <button className="ghost mt" onClick={reset}>取消</button>}
      {message && <div className="muted mt">{message}</div>}
    </div>
  );
}

function ConsumptionTxRow({
  transaction,
  categories,
  open,
  onOpen,
  onClose,
}: {
  transaction: Transaction;
  categories: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const [date, setDate] = useState(transaction.date);
  const [category, setCategory] = useState(transaction.category ?? '');
  const [amount, setAmount] = useState(String(Math.abs(Number(transaction.amount))));
  const [note, setNote] = useState(transaction.note ?? '');
  useEffect(() => {
    if (!open) return;
    setDate(transaction.date);
    setCategory(transaction.category ?? '');
    setAmount(String(Math.abs(Number(transaction.amount))));
    setNote(transaction.note ?? '');
  }, [open, transaction]);
  if (!open) {
    return (
      <div className="tx" onPointerDown={stop} onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div><div>支出{transaction.category ? ` · ${transaction.category}` : ''}</div><div className="meta">{transaction.date}{transaction.note ? ` · ${transaction.note}` : ''}</div></div>
        <span className="amt out">{fmtMoney(transaction.amount)}</span>
      </div>
    );
  }
  return (
    <div className="card" onPointerDown={stop} style={{ margin: '8px 0' }}>
      <div className="field"><label>日期</label><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="field"><label>类型</label><div className="chips">{categories.map((value) => <button key={value} className={`chip${category === value ? ' active' : ''}`} onClick={() => setCategory(value)}>{value}</button>)}</div></div>
      <div className="field"><label>金额</label><input type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
      <div className="field"><label>备注</label><input value={note} onChange={(event) => setNote(event.target.value)} /></div>
      <div className="card-row-actions mt">
        <button className="mini" onClick={onClose}>取消</button>
        <button className="mini" disabled={update.isPending} onClick={async () => { await update.mutateAsync({ id: transaction.id, date, category: category || undefined, amount, note }); onClose(); }}>保存</button>
        <button className="mini danger" onClick={() => remove.mutate(transaction.id)}>删除</button>
      </div>
    </div>
  );
}
