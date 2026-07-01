import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCardViews,
  useCards,
  useCategories,
  useCreateEntry,
  useDeleteTransaction,
  useSetFund,
  useSetQuota,
  useSpendCardMonth,
  useTransactions,
} from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import type { Transaction } from '../api/types';

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
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

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <strong>
          {card.name}
          <span className="type-tag">{CARD_TYPE_LABEL[card.type]}</span>
        </strong>
        <span style={{ width: 40 }} />
      </div>

      {card.type === 'SPEND' ? (
        <SpendDetail cardId={id} cardName={card.name} onDeleted={() => navigate('/')} />
      ) : (
        <FundDetail cardId={id} cardName={card.name} onDeleted={() => navigate('/fund')} />
      )}
    </div>
  );
}

// ---------- 消费卡：每月额度 + 滑动记消费 ----------
function SpendDetail({
  cardId,
  cardName,
  onDeleted,
}: {
  cardId: string;
  cardName: string;
  onDeleted: () => void;
}) {
  const [month, setMonth] = useState(currentMonthStr());
  const view = useSpendCardMonth(cardId, month);
  const setQuota = useSetQuota();
  const categories = useCategories();
  const createEntry = useCreateEntry();
  const delTx = useDeleteTransaction();

  const [quota, setQuotaInput] = useState('');
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [msg, setMsg] = useState('');
  const startX = useRef<number | null>(null);
  const dragRef = useRef(0);
  const gestureRef = useRef(false); // 保证一次手势只结算一次
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
    setDrag(0);
  };
  const submit = async () => {
    if (submittingRef.current) return; // 防重复提交
    if (!amount || Number(amount) <= 0) {
      setMsg('请先填写金额');
      return;
    }
    submittingRef.current = true;
    try {
      await createEntry.mutateAsync({ cardId, type: 'OUT', amount, category: category || undefined });
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
    if (dx > 0) dx = 0; // 只能左滑
    dx = Math.max(-120, dx);
    dragRef.current = dx;
    setDrag(dx);
  };
  const onUp = () => {
    if (!gestureRef.current) return; // 一次手势只结算一次（pointerup/pointerleave 不重复触发）
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

  return (
    <>
      {/* 月份 + 额度 */}
      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="row-between" style={{ gap: 8 }}>
          <input
            type="number"
            step="0.01"
            placeholder={v?.hasQuota ? `当前额度 ${fmtMoney(v.quota)}` : '设置本月额度'}
            value={quota}
            onChange={(e) => setQuotaInput(e.target.value)}
          />
          <button style={{ width: 'auto', padding: '11px 16px' }} onClick={saveQuota} disabled={!quota}>
            存额度
          </button>
        </div>
      </div>

      {/* 滑动记消费卡片 */}
      <div
        className={`swipe-card ${armed ? 'expense' : ''}`}
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div className="swipe-balance">
          <span className="muted">{v?.overspent ? '本月超支' : '本月剩余'}</span>
          <div className={`big ${v?.overspent ? 'neg' : ''}`}>
            {fmtMoney(v ? Math.abs(remaining) : '0')}
          </div>
          <div className="muted">
            额度 {v?.hasQuota ? fmtMoney(v.quota) : '未设'} · 已消费 {fmtMoney(v?.spent ?? '0')}
          </div>
        </div>

        {armed && (
          <div className="swipe-form" onPointerDown={(e) => e.stopPropagation()}>
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
            />
          </div>
        )}
        <div className="swipe-hint expense">
          {armed ? '← 填好金额后，再次左滑确认支出' : '← 左滑记一笔消费'}
        </div>
      </div>
      {armed && (
        <button className="ghost mt" onClick={reset}>
          取消
        </button>
      )}
      {msg && <div className="muted mt">{msg}</div>}

      <div className="section-title">本月流水</div>
      <TxList cardId={cardId} month={month} onDelete={(txId) => delTx.mutate(txId)} />

      <CardManageBar cardId={cardId} name={cardName} onDeleted={onDeleted} />
    </>
  );
}

// ---------- 基金：直填本金/市值两个数，盈亏自动算 ----------
function FundDetail({
  cardId,
  cardName,
  onDeleted,
}: {
  cardId: string;
  cardName: string;
  onDeleted: () => void;
}) {
  const views = useCardViews();
  const cards = useCards();
  const setFund = useSetFund();
  const [msg, setMsg] = useState('');
  const view = views.data?.find((v) => v.cardId === cardId);
  const card = cards.data?.find((c) => c.id === cardId);

  const [principal, setPrincipal] = useState('');
  const [value, setValue] = useState('');

  // 初始填入当前值
  const curPrincipal = card?.fundPrincipal ?? '0';
  const curValue = card?.fundValue ?? '0';

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
          <label>累计投入 · 本金（当前 {fmtMoney(curPrincipal)}）</label>
          <input
            type="number"
            step="0.01"
            placeholder="不改可留空"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          />
        </div>
        <div className="field">
          <label>当前市值（当前 {fmtMoney(curValue)}）</label>
          <input
            type="number"
            step="0.01"
            placeholder="不改可留空"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button className="primary" onClick={save} disabled={!principal && !value}>
          保存
        </button>
        {msg && <div className="muted mt">{msg}</div>}
      </div>

      <CardManageBar cardId={cardId} name={cardName} onDeleted={onDeleted} />
    </>
  );
}

function TxList({
  cardId,
  month,
  onDelete,
}: {
  cardId: string;
  month?: string;
  onDelete: (id: string) => void;
}) {
  const txs = useTransactions({ cardId });
  const rows = (txs.data ?? []).filter((t) => !month || t.date.slice(0, 7) === month);
  const label = (t: Transaction) =>
    t.type === 'IN' ? '收入' : t.type === 'OUT' ? '支出' : t.type === 'TRANSFER' ? '调账' : '市值/调整';
  const cls = (t: Transaction) => (t.type === 'IN' ? 'in' : t.type === 'OUT' ? 'out' : 'neutral');
  return (
    <div className="card">
      {rows.length ? (
        rows.map((t) => (
          <div className="tx" key={t.id}>
            <div>
              <div>
                {label(t)}
                {t.category ? ` · ${t.category}` : ''}
              </div>
              <div className="meta">
                {t.date}
                {t.note ? ` · ${t.note}` : ''}
              </div>
            </div>
            <div className="row-between">
              <span className={`amt ${cls(t)}`}>{fmtMoney(t.amount)}</span>
              <button className="ghost" onClick={() => onDelete(t.id)}>
                ✕
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="muted">暂无流水</div>
      )}
    </div>
  );
}
