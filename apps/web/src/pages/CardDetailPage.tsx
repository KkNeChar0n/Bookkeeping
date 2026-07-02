import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCardViews,
  useCards,
  useCategories,
  useCreateEntry,
  useDeleteCard,
  useDeleteTransaction,
  useSetFund,
  useSetQuota,
  useSpendCardMonth,
  useTransactions,
  useUpdateCard,
} from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
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
  const setQuota = useSetQuota();
  const categories = useCategories();
  const createEntry = useCreateEntry();
  const delTx = useDeleteTransaction();
  const txs = useTransactions({ cardId });

  const [quota, setQuotaInput] = useState('');
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

  const saveQuota = async () => {
    if (!quota) return;
    await setQuota.mutateAsync({ cardId, month, amount: quota });
    setQuotaInput('');
    setMsg('额度已保存');
  };

  const reset = () => {
    setArmed(false);
    setAmount('');
    setCategory('');
    setNote('');
    setDrag(0);
  };
  const submit = async () => {
    if (submittingRef.current) return;
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
        category: category || undefined,
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
  const rows = (txs.data ?? []).filter((t) => t.date.slice(0, 7) === month);

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
        {/* 记账日期 + 额度（可点，不触发滑动） */}
        <div onPointerDown={stop}>
          <div className="field">
            <label>记账日期（记到这一天，额度按当月）</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="row-between" style={{ gap: 8 }}>
            <input
              type="number"
              step="0.01"
              placeholder={v?.hasQuota ? `当前额度 ${fmtMoney(v.quota)}` : '设置本月额度'}
              value={quota}
              onChange={(e) => setQuotaInput(e.target.value)}
            />
            <button style={{ width: 'auto', padding: '11px 16px', whiteSpace: 'nowrap' }} onClick={saveQuota} disabled={!quota}>
              存额度
            </button>
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
          {armed ? '← 填好金额后，再次左滑确认支出' : '← 在此区域左滑记一笔消费'}
        </div>

        <div className="divider" />

        {/* 流水 */}
        <div className="detail-sub">本月流水</div>
        {rows.length ? (
          rows.map((t) => (
            <div className="tx" key={t.id}>
              <div>
                <div>
                  支出{t.category ? ` · ${t.category}` : ''}
                </div>
                <div className="meta">
                  {t.date}
                  {t.note ? ` · ${t.note}` : ''}
                </div>
              </div>
              <div className="row-between">
                <span className="amt out">{fmtMoney(t.amount)}</span>
                <button className="ghost" onPointerDown={stop} onClick={() => delTx.mutate(t.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">本月暂无流水</div>
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
  const [principal, setPrincipal] = useState('');
  const [value, setValue] = useState('');

  const save = async () => {
    setMsg('');
    const body: { id: string; principal?: string; value?: string } = { id: cardId };
    if (principal) body.principal = principal;
    if (value) body.value = value;
    if (!body.principal && !body.value) return;
    await setFund.mutateAsync(body);
    setPrincipal('');
    setValue('');
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
          <label>累计投入 · 本金（当前 {fmtMoney(initialPrincipal)}）</label>
          <input type="number" step="0.01" placeholder="不改可留空" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </div>
        <div className="field">
          <label>当前市值（当前 {fmtMoney(initialValue)}）</label>
          <input type="number" step="0.01" placeholder="不改可留空" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button className="primary" onClick={save} disabled={!principal && !value}>
          保存
        </button>
        {msg && <div className="muted mt">{msg}</div>}
      </div>
    </>
  );
}
