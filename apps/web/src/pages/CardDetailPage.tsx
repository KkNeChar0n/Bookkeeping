import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCardViews,
  useCards,
  useCategories,
  useCreateEntry,
  useDeleteTransaction,
  useSetBalance,
  useTransactions,
  useTransfer,
} from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
import { fmtMoney, fmtSigned } from '../lib/format';
import type { Transaction } from '../api/types';

type Mode = 'idle' | 'income' | 'expense';
const THRESH = 70;

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const views = useCardViews();
  const categories = useCategories();
  const createEntry = useCreateEntry();
  const transfer = useTransfer();
  const setBalance = useSetBalance();
  const delTx = useDeleteTransaction();

  const card = cards.data?.find((c) => c.id === id);
  const view = views.data?.find((v) => v.cardId === id);

  const [mode, setMode] = useState<Mode>('idle');
  const [drag, setDrag] = useState(0);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [msg, setMsg] = useState('');
  const startX = useRef<number | null>(null);

  const canIncome = card?.type === 'SAVINGS';
  const canExpense = card?.type === 'SPEND';

  const reset = () => {
    setMode('idle');
    setAmount('');
    setCategory('');
    setDrag(0);
  };

  const submit = async (kind: 'income' | 'expense') => {
    if (!card) return;
    if (!amount || Number(amount) <= 0) {
      setMsg('请先填写金额');
      return;
    }
    try {
      await createEntry.mutateAsync({
        cardId: card.id,
        type: kind === 'income' ? 'IN' : 'OUT',
        amount,
        category: category || undefined,
      });
      setMsg(kind === 'income' ? '已记收入' : '已记支出');
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
    // 只允许朝合法方向拖动
    if (dx > 0 && !canIncome) dx = 0;
    if (dx < 0 && !canExpense) dx = 0;
    setDrag(Math.max(-120, Math.min(120, dx)));
  };
  const onUp = () => {
    const dx = drag;
    startX.current = null;
    if (mode === 'idle') {
      if (dx > THRESH && canIncome) setMode('income');
      else if (dx < -THRESH && canExpense) setMode('expense');
    } else {
      // 已进入表单：同向再滑一次=确认，反向=取消
      if (mode === 'income' && dx > THRESH) return void submit('income');
      if (mode === 'expense' && dx < -THRESH) return void submit('expense');
      if ((mode === 'income' && dx < -THRESH) || (mode === 'expense' && dx > THRESH)) reset();
    }
    setDrag(0);
  };

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

  const catList =
    mode === 'income' ? (categories.data?.income ?? []) : (categories.data?.expense ?? []);
  const hint =
    mode === 'idle'
      ? canIncome && canExpense
        ? '右滑记收入 · 左滑记支出'
        : canIncome
          ? '右滑记收入 →'
          : canExpense
            ? '← 左滑记支出'
            : '基金卡请用下方按钮'
      : mode === 'income'
        ? '填好金额后，再次右滑确认 →'
        : '← 填好金额后，再次左滑确认';

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

      {/* 可滑动的余额卡片 */}
      <div
        className={`swipe-card ${mode}`}
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div className="swipe-balance">
          <span className="muted">
            {card.type === 'FUND' ? '市值' : '当前余额'}
          </span>
          <div className="big">{fmtMoney(view?.balance ?? '0')}</div>
          {card.type === 'FUND' && view && (
            <div className={`muted ${Number(view.profit) >= 0 ? 'pos' : 'neg'}`}>
              盈亏 {fmtSigned(view.profit)}
              {view.profitPct !== null ? `（${view.profitPct}%）` : ''} · 本金 {fmtMoney(view.principal)}
            </div>
          )}
        </div>

        {mode !== 'idle' && (
          <div className="swipe-form" onPointerDown={(e) => e.stopPropagation()}>
            <div className="chips">
              {catList.map((c) => (
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

        <div className={`swipe-hint ${mode}`}>{hint}</div>
      </div>

      {mode !== 'idle' && (
        <button className="ghost mt" onClick={reset}>
          取消
        </button>
      )}
      {msg && <div className="muted mt">{msg}</div>}

      <FundAndTransfer
        card={card}
        cards={cards.data ?? []}
        onTransfer={(body) => transfer.mutateAsync(body).then(() => setMsg('调账完成'))}
        onSetValue={(target) =>
          setBalance.mutateAsync({ cardId: card.id, targetBalance: target, note: '市值更新' }).then(() => setMsg('已更新市值'))
        }
      />

      <div className="section-title">流水</div>
      <TxList cardId={card.id} onDelete={(txId) => delTx.mutate(txId)} />
    </div>
  );
}

// ---- 调账 & 基金更新市值 ----
function FundAndTransfer({
  card,
  cards,
  onTransfer,
  onSetValue,
}: {
  card: { id: string; type: string };
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
  const [dir, setDir] = useState<'OUT' | 'IN'>('OUT');
  const [peer, setPeer] = useState('');
  const [amt, setAmt] = useState('');
  const [val, setVal] = useState('');

  return (
    <div className="mt">
      <div className="row-between" style={{ gap: 8 }}>
        <button style={{ flex: 1 }} onClick={() => setOpen(open === 'transfer' ? 'none' : 'transfer')}>
          调账
        </button>
        {card.type === 'FUND' && (
          <button style={{ flex: 1 }} onClick={() => setOpen(open === 'value' ? 'none' : 'value')}>
            更新市值
          </button>
        )}
      </div>

      {open === 'transfer' && (
        <div className="card mt">
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={dir === 'OUT' ? 'active' : ''} onClick={() => setDir('OUT')}>
              调出
            </button>
            <button className={dir === 'IN' ? 'active' : ''} onClick={() => setDir('IN')}>
              调入
            </button>
          </div>
          <div className="field">
            <label>对手卡</label>
            <select value={peer} onChange={(e) => setPeer(e.target.value)}>
              <option value="">选择</option>
              {cards
                .filter((c) => c.id !== card.id)
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
              await onTransfer({ cardId: card.id, direction: dir, peerCardId: peer, amount: amt });
              setAmt('');
              setOpen('none');
            }}
          >
            提交调账
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

function TxList({ cardId, onDelete }: { cardId: string; onDelete: (id: string) => void }) {
  const txs = useTransactions({ cardId });
  const label = (t: Transaction) =>
    t.type === 'IN' ? '收入' : t.type === 'OUT' ? '支出' : t.type === 'TRANSFER' ? '调账' : '市值/调整';
  const cls = (t: Transaction) => (t.type === 'IN' ? 'in' : t.type === 'OUT' ? 'out' : 'neutral');
  return (
    <div className="card">
      {txs.data?.length ? (
        txs.data.map((t) => (
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
