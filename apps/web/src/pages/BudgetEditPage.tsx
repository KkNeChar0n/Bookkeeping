import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useAddBudgetDetail,
  useBudgetCurrentMonth,
  useCards,
  useCategories,
  useDeleteBudgetDetail,
} from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';

type Mode = 'idle' | 'IN' | 'EXPENSE' | 'OUT';
const THRESH = 60;
const KIND_LABEL: Record<'IN' | 'OUT' | 'EXPENSE', string> = { IN: '收入', OUT: '调出', EXPENSE: '支出' };

export function BudgetEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cards = useCards();
  const card = cards.data?.find((c) => c.id === id);
  const categories = useCategories();
  const addDetail = useAddBudgetDetail();
  const delDetail = useDeleteBudgetDetail();

  const [month, setMonth] = useState(params.get('month') || currentMonthStr());
  const view = useBudgetCurrentMonth(id, month);
  const v = view.data;

  const [mode, setMode] = useState<Mode>('idle');
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef(false);
  const submittingRef = useRef(false);

  const reset = () => {
    setMode('idle');
    setAmount('');
    setCategory('');
    setNote('');
    setDx(0);
    setDy(0);
  };

  const submit = async (kind: 'IN' | 'EXPENSE' | 'OUT') => {
    if (submittingRef.current) return;
    if (!amount || Number(amount) <= 0) {
      setMsg('请先填写金额');
      return;
    }
    submittingRef.current = true;
    try {
      await addDetail.mutateAsync({
        cardId: id,
        month,
        kind,
        category: category || undefined,
        label: note,
        amount,
      });
      setMsg(`已记${KIND_LABEL[kind]}`);
      reset();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      submittingRef.current = false;
    }
  };

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    gestureRef.current = true;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!gestureRef.current || !start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (Math.abs(mx) > Math.abs(my)) {
      setDx(Math.max(-120, Math.min(120, mx)));
      setDy(0);
    } else {
      setDy(Math.max(-120, Math.min(0, my)));
      setDx(0);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!gestureRef.current || !start.current) return;
    gestureRef.current = false;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    start.current = null;
    setDx(0);
    setDy(0);
    const adx = Math.abs(mx);
    const ady = Math.abs(my);

    if (mode === 'idle') {
      if (ady > adx && my < -THRESH) setMode('OUT');
      else if (mx > THRESH) setMode('IN');
      else if (mx < -THRESH) setMode('EXPENSE');
      return;
    }
    // 已就绪：同方向再滑一次=确认
    if (mode === 'IN' && mx > THRESH) return void submit('IN');
    if (mode === 'EXPENSE' && mx < -THRESH) return void submit('EXPENSE');
    if (mode === 'OUT' && ady > adx && my < -THRESH) return void submit('OUT');
    // 反向明显滑动=取消
    if (adx > THRESH || ady > THRESH) reset();
  };

  const catList =
    mode === 'IN' ? (categories.data?.income ?? []) : mode === 'EXPENSE' ? (categories.data?.expense ?? []) : [];
  const hint =
    mode === 'idle'
      ? '右滑记收入 →　← 左滑记支出　↑ 上滑调出'
      : mode === 'IN'
        ? '填好后，再次右滑确认收入 →'
        : mode === 'EXPENSE'
          ? '← 填好后，再次左滑确认支出'
          : '↑ 填好后，再次上滑确认调出';
  const cardCls = mode === 'IN' ? 'income' : mode === 'EXPENSE' || mode === 'OUT' ? 'expense' : '';

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate(`/budget/${id}`)}>
          ‹ 返回
        </button>
        <div className="detail-title">
          <strong>{card?.name ?? '储蓄卡'}</strong>
          <span className="type-tag">收支调整</span>
        </div>
        <span style={{ width: 40 }} />
      </div>

      <div className="card">
        <div className="field" style={{ margin: 0 }} onPointerDown={(e) => e.stopPropagation()}>
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div
        className={`swipe-card ${cardCls}`}
        style={{ transform: `translate(${dx}px, ${dy}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div className="swipe-balance">
          <span className="muted">{month} · 预期余额</span>
          <div className="big">{v ? fmtMoney(v.expected) : '—'}</div>
        </div>

        {mode !== 'idle' && (
          <div className="swipe-form" onPointerDown={(e) => e.stopPropagation()}>
            {catList.length > 0 && (
              <div className="chips">
                {catList.map((c) => (
                  <button key={c} className={`chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="金额"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <input placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <div className="swipe-hint">{hint}</div>
      </div>
      {mode !== 'idle' && (
        <button className="ghost mt" onClick={reset}>
          取消
        </button>
      )}
      {msg && <div className="muted mt">{msg}</div>}

      <div className="section-title">本月明细</div>
      <div className="card">
        {v && v.details.length ? (
          v.details.map((d) => (
            <div className="tx" key={d.id}>
              <div>
                <div>{d.label}</div>
                <div className="meta">
                  {KIND_LABEL[d.kind]}
                  {d.category && d.category !== d.label ? ` · ${d.category}` : ''}
                </div>
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
          <div className="muted">本月还没有明细</div>
        )}
      </div>
    </div>
  );
}
