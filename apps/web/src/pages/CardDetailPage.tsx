import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCardViews,
  useCards,
  useCategories,
  useCreateEntry,
  useDeleteTransaction,
  useSetBalance,
  useSetQuota,
  useSpendCardMonth,
  useTransactions,
  useTransfer,
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
        <FundDetail
          cardId={id}
          cardName={card.name}
          initialBalance={card.initialBalance}
          onDeleted={() => navigate('/summary')}
        />
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
    if (!amount || Number(amount) <= 0) {
      setMsg('请先填写金额');
      return;
    }
    try {
      await createEntry.mutateAsync({ cardId, type: 'OUT', amount, category: category || undefined });
      setMsg('已记支出');
      reset();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    }
  };

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    let dx = e.clientX - startX.current;
    if (dx > 0) dx = 0; // 只能左滑
    setDrag(Math.max(-120, dx));
  };
  const onUp = () => {
    const dx = drag;
    startX.current = null;
    if (!armed) {
      if (dx < -THRESH) setArmed(true);
    } else {
      if (dx < -THRESH) return void submit();
    }
    setDrag(0);
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

// ---------- 基金：市值/本金/盈亏 + 调账/更新市值 ----------
function FundDetail({
  cardId,
  cardName,
  initialBalance,
  onDeleted,
}: {
  cardId: string;
  cardName: string;
  initialBalance: string;
  onDeleted: () => void;
}) {
  const views = useCardViews();
  const cards = useCards();
  const transfer = useTransfer();
  const setBalance = useSetBalance();
  const delTx = useDeleteTransaction();
  const [msg, setMsg] = useState('');
  const view = views.data?.find((v) => v.cardId === cardId);

  return (
    <>
      <div className="card">
        <div className="swipe-balance">
          <span className="muted">市值</span>
          <div className="big">{fmtMoney(view?.balance ?? '0')}</div>
          {view && (
            <div className={`muted ${Number(view.profit) >= 0 ? 'pos' : 'neg'}`}>
              盈亏 {fmtSigned(view.profit)}
              {view.profitPct !== null ? `（${view.profitPct}%）` : ''} · 本金 {fmtMoney(view.principal)}
            </div>
          )}
        </div>
      </div>

      <FundActions
        cardId={cardId}
        cards={cards.data ?? []}
        onTransfer={(b) => transfer.mutateAsync(b).then(() => setMsg('调账完成'))}
        onSetValue={(t) =>
          setBalance.mutateAsync({ cardId, targetBalance: t, note: '市值更新' }).then(() => setMsg('已更新市值'))
        }
      />
      {msg && <div className="muted mt">{msg}</div>}

      <div className="section-title">流水</div>
      <TxList cardId={cardId} onDelete={(txId) => delTx.mutate(txId)} />

      <CardManageBar
        cardId={cardId}
        name={cardName}
        initialBalance={initialBalance}
        showInitial
        onDeleted={onDeleted}
      />
    </>
  );
}

function FundActions({
  cardId,
  cards,
  onTransfer,
  onSetValue,
}: {
  cardId: string;
  cards: { id: string; name: string }[];
  onTransfer: (b: {
    cardId: string;
    direction: 'OUT' | 'IN';
    peerCardId: string;
    amount: string;
  }) => Promise<unknown>;
  onSetValue: (target: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState<'none' | 'transfer' | 'value'>('none');
  const [dir, setDir] = useState<'OUT' | 'IN'>('IN');
  const [peer, setPeer] = useState('');
  const [amt, setAmt] = useState('');
  const [val, setVal] = useState('');

  return (
    <div className="mt">
      <div className="row-between" style={{ gap: 8 }}>
        <button style={{ flex: 1 }} onClick={() => setOpen(open === 'transfer' ? 'none' : 'transfer')}>
          申购/赎回
        </button>
        <button style={{ flex: 1 }} onClick={() => setOpen(open === 'value' ? 'none' : 'value')}>
          更新市值
        </button>
      </div>

      {open === 'transfer' && (
        <div className="card mt">
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={dir === 'IN' ? 'active' : ''} onClick={() => setDir('IN')}>
              申购(转入)
            </button>
            <button className={dir === 'OUT' ? 'active' : ''} onClick={() => setDir('OUT')}>
              赎回(转出)
            </button>
          </div>
          <div className="field">
            <label>对手卡</label>
            <select value={peer} onChange={(e) => setPeer(e.target.value)}>
              <option value="">选择</option>
              {cards
                .filter((c) => c.id !== cardId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>金额</label>
            <input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
          <button
            className="primary"
            disabled={!peer || !amt}
            onClick={async () => {
              await onTransfer({ cardId, direction: dir, peerCardId: peer, amount: amt });
              setAmt('');
              setOpen('none');
            }}
          >
            提交
          </button>
        </div>
      )}

      {open === 'value' && (
        <div className="card mt">
          <div className="field">
            <label>当前市值（按最新净值填写）</label>
            <input type="number" step="0.01" value={val} onChange={(e) => setVal(e.target.value)} />
          </div>
          <button
            className="primary"
            disabled={!val}
            onClick={async () => {
              await onSetValue(val);
              setVal('');
              setOpen('none');
            }}
          >
            更新
          </button>
        </div>
      )}
    </div>
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
