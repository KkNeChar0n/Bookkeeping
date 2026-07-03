import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCardViews,
  useCards,
  useCategories,
  useCreateEntry,
  useDeleteCard,
  useDeleteTransaction,
  useSetFund,
  useSpendCardMonth,
  useTransactions,
  useUpdateCard,
  useUpdateTransaction,
} from '../api/hooks';
import { CARD_TYPE_LABEL, type Transaction } from '../api/types';
import { fmtMoney, fmtSigned, todayStr } from '../lib/format';

const stop = (e: React.PointerEvent) => e.stopPropagation();

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const update = useUpdateCard();
  const del = useDeleteCard();
  const card = cards.data?.find((c) => c.id === id);

  if (!card) {
    return (
      <div>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="muted mt">卡片不存在</div>
      </div>
    );
  }

  const backTo = card.type === 'SPEND' ? '/' : '/fund';
  const rename = () => {
    const v = window.prompt('新名称', card.name);
    if (v && v.trim()) update.mutate({ id, name: v.trim() });
  };
  const remove = async () => {
    if (!window.confirm(`确定删除「${card.name}」？`)) return;
    await del.mutateAsync(id).then(() => navigate(backTo));
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate(backTo)}>
          ‹ 返回
        </button>
        <div className="detail-title">
          <strong>{card.name}</strong>
          <span className="type-tag">{CARD_TYPE_LABEL[card.type]}</span>
        </div>
        <div className="detail-actions">
          <button className="mini" onClick={rename}>
            改名
          </button>
          <button className="mini danger" onClick={remove}>
            删除
          </button>
        </div>
      </div>

      {card.type === 'SPEND' ? (
        <SpendDetail cardId={id} />
      ) : (
        <FundDetail cardId={id} initialPrincipal={card.fundPrincipal ?? '0'} initialValue={card.fundValue ?? '0'} />
      )}
    </div>
  );
}

// ---------- 消费卡：整框可左滑记账 ----------
function SpendDetail({ cardId }: { cardId: string }) {
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || todayStr());
  const month = date.slice(0, 7);
  const view = useSpendCardMonth(cardId, month);
  const categories = useCategories();
  const createEntry = useCreateEntry();
  const txs = useTransactions({ cardId });

  const [openId, setOpenId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const startX = useRef<number | null>(null);
  const dragRef = useRef(0);
  const gestureRef = useRef(false);
  const submittingRef = useRef(false);
  const THRESH = 70;

  const reset = () => {
    setArmed(false);
    setAmount('');
    setCategory('');
    setNote('');
    setDrag(0);
  };
  const submit = async () => {
    if (submittingRef.current) return;
    if (!category) {
      setMsg('请先选择类型');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setMsg('请先填写金额');
      return;
    }
    submittingRef.current = true;
    try {
      await createEntry.mutateAsync({
        cardId,
        type: 'OUT',
        amount,
        date,
        category,
        note: note || undefined,
      });
      setMsg('已记支出');
      reset();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      submittingRef.current = false;
    }
  };

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragRef.current = 0;
    gestureRef.current = true;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!gestureRef.current || startX.current === null) return;
    let dx = e.clientX - startX.current;
    if (dx > 0) dx = 0;
    dx = Math.max(-120, dx);
    dragRef.current = dx;
    setDrag(dx);
  };
  const onUp = () => {
    if (!gestureRef.current) return;
    gestureRef.current = false;
    const dx = dragRef.current;
    startX.current = null;
    dragRef.current = 0;
    setDrag(0);
    if (!armed) {
      if (dx < -THRESH) setArmed(true);
    } else if (dx < -THRESH) {
      submit();
    }
  };

  const v = view.data;
  const remaining = v ? Number(v.remaining) : 0;
  const rows = (txs.data ?? []).filter((t) => t.date === date);

  return (
    <>
      <div
        className={`swipe-card ${armed ? 'expense' : ''}`}
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {/* 记账日期（可点，不触发滑动）。额度在储蓄卡编辑里设置，这里只读 */}
        <div onPointerDown={stop}>
          <div className="field" style={{ margin: 0 }}>
            <label>记账日期（记到这一天，额度按当月）</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="muted mt" style={{ fontSize: 12 }}>
            本月额度 {v?.hasQuota ? fmtMoney(v.quota) : '未设'} · 额度在「储蓄卡 → 本月消费预算」里设置
          </div>
        </div>

        <div className="divider" />

        {/* 余额 */}
        <div className="swipe-balance">
          <span className="muted">{v?.overspent ? '本月超支' : '本月剩余'}</span>
          <div className={`big ${v?.overspent ? 'neg' : ''}`}>{fmtMoney(v ? Math.abs(remaining) : '0')}</div>
          <div className="muted">
            额度 {v?.hasQuota ? fmtMoney(v.quota) : '未设'} · 已消费 {fmtMoney(v?.spent ?? '0')}
          </div>
        </div>

        {armed && (
          <div className="swipe-form" onPointerDown={stop}>
            <div className="chips">
              {(categories.data?.expense ?? []).map((c) => (
                <button
                  key={c}
                  className={`chip${category === c ? ' active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
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
        <div className="swipe-hint expense">
          {armed ? '← 选类型、填金额后，再次左滑确认' : '← 在此区域左滑记一笔消费'}
        </div>

        <div className="divider" />

        {/* 当日流水（点击可改，同一时间只展开一条） */}
        <div className="detail-sub">当日流水（{date}，点一笔可改）</div>
        {rows.length ? (
          rows.map((t) => (
            <SpendTxRow
              key={t.id}
              t={t}
              cats={categories.data?.expense ?? []}
              open={openId === t.id}
              onOpen={() => setOpenId(t.id)}
              onClose={() => setOpenId(null)}
            />
          ))
        ) : (
          <div className="muted">当日暂无流水</div>
        )}
      </div>

      {armed && (
        <button className="ghost mt" onClick={reset}>
          取消
        </button>
      )}
      {msg && <div className="muted mt">{msg}</div>}
    </>
  );
}

// ---------- 基金：直填本金/市值 ----------
function FundDetail({
  cardId,
  initialPrincipal,
  initialValue,
}: {
  cardId: string;
  initialPrincipal: string;
  initialValue: string;
}) {
  const views = useCardViews();
  const setFund = useSetFund();
  const [msg, setMsg] = useState('');
  const view = views.data?.find((v) => v.cardId === cardId);
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [value, setValue] = useState(initialValue);

  // 回显当前本金/市值，可直接改
  useEffect(() => {
    setPrincipal(initialPrincipal);
    setValue(initialValue);
  }, [initialPrincipal, initialValue]);

  const save = async () => {
    setMsg('');
    const body: { id: string; principal?: string; value?: string } = { id: cardId };
    if (principal !== '') body.principal = principal;
    if (value !== '') body.value = value;
    if (!body.principal && !body.value) return;
    await setFund.mutateAsync(body);
    setMsg('已更新');
  };

  const p = view ? Number(view.profit) : 0;

  return (
    <>
      <div className="card">
        <div className="swipe-balance">
          <span className="muted">市值</span>
          <div className="big">{fmtMoney(view?.balance ?? '0')}</div>
          {view && (
            <div className={`muted ${p >= 0 ? 'pos' : 'neg'}`}>
              盈亏 {fmtSigned(view.profit)}
              {view.profitPct !== null ? `（${view.profitPct > 0 ? '+' : ''}${view.profitPct}%）` : ''} · 本金{' '}
              {fmtMoney(view.principal)}
            </div>
          )}
        </div>
      </div>

      <div className="section-title">更新（从基金 App 抄这两个数）</div>
      <div className="card">
        <div className="field">
          <label>累计投入 · 本金</label>
          <input type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </div>
        <div className="field">
          <label>当前市值</label>
          <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button className="primary" onClick={save} disabled={!principal && !value}>
          保存
        </button>
        {msg && <div className="muted mt">{msg}</div>}
      </div>
    </>
  );
}

// 消费流水一行：点击展开，可改日期/类型/金额/备注，或删除。
// 展开状态由父级控制 —— 同一时间只允许一条在编辑。
function SpendTxRow({
  t,
  cats,
  open,
  onOpen,
  onClose,
}: {
  t: Transaction;
  cats: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const [date, setDate] = useState(t.date);
  const [category, setCategory] = useState(t.category ?? '');
  const [amount, setAmount] = useState(String(Math.abs(Number(t.amount))));
  const [note, setNote] = useState(t.note ?? '');

  // 每次展开都从当前值刷新，等于放弃上一次未保存的修改
  useEffect(() => {
    if (open) {
      setDate(t.date);
      setCategory(t.category ?? '');
      setAmount(String(Math.abs(Number(t.amount))));
      setNote(t.note ?? '');
    }
  }, [open, t]);

  const save = async () => {
    await update.mutateAsync({ id: t.id, date, category: category || undefined, amount, note });
    onClose();
  };

  if (!open) {
    return (
      <div className="tx" onPointerDown={stop} onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div>
          <div>支出{t.category ? ` · ${t.category}` : ''}</div>
          <div className="meta">
            {t.date}
            {t.note ? ` · ${t.note}` : ''}
          </div>
        </div>
        <span className="amt out">{fmtMoney(t.amount)}</span>
      </div>
    );
  }

  return (
    <div className="card" onPointerDown={stop} style={{ margin: '8px 0' }}>
      <div className="field">
        <label>日期</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>类型</label>
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={`chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>金额</label>
        <input type="number" step="0.01" placeholder="金额" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>备注</label>
        <input placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="card-row-actions mt">
        <button className="mini" onClick={onClose}>
          取消
        </button>
        <button className="mini" onClick={save} disabled={update.isPending}>
          保存
        </button>
        <button className="mini danger" onClick={() => del.mutate(t.id)}>
          删除
        </button>
      </div>
    </div>
  );
}
