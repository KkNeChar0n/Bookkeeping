import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpendMonth, useTransactions } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { addDays, fmtDateCN, fmtMoney, todayStr } from '../lib/format';
import type { SpendMonthView } from '../services/spend.service';

export function DailyPage() {
  const [date, setDate] = useState(todayStr());
  const month = date.slice(0, 7);
  const views = useSpendMonth(month);
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  // 在卡片区左右滑动切换日期（区分滑动/点击，点击仍进详情）
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const shift = (d: number) => setDate((cur) => addDays(cur, d));
  const onDown = (e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onUp = (e: React.PointerEvent) => {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      shift(dx < 0 ? 1 : -1);
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (swiped.current) {
      e.stopPropagation();
      swiped.current = false;
    }
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 2 }}>
        {date !== todayStr() ? (
          <button className="today-btn" onClick={() => setDate(todayStr())}>
            回今天
          </button>
        ) : (
          <span />
        )}
        <button className="ghost" aria-label="设置" onClick={() => navigate('/settings')}>
          ⚙️
        </button>
      </div>

      <div className="date-header" style={{ justifyContent: 'center', position: 'relative' }}>
        <button className="date-text" onClick={openPicker}>
          {fmtDateCN(date)}
        </button>
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ position: 'absolute', left: '50%', bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      </div>
      <div className="muted date-hint">点日期可选年月日 · 在卡片上左右滑动切换日期</div>

      <div className="day-swipe" onPointerDown={onDown} onPointerUp={onUp} onClickCapture={onClickCapture}>
        {views.data?.length ? (
          <div className="stack">
            {views.data.map((v) => (
              <SpendCard key={v.cardId} v={v} date={date} />
            ))}
          </div>
        ) : (
          <div className="card muted">还没有消费卡，点下方「新建消费卡」。</div>
        )}

        <div className="spacer" />
        <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? '收起' : '＋ 新建消费卡'}</button>
        {showCreate && (
          <div className="mt">
            <CreateCardForm type="SPEND" placeholder="如：日常消费" />
          </div>
        )}
      </div>
    </div>
  );
}

function SpendCard({ v, date }: { v: SpendMonthView; date: string }) {
  const navigate = useNavigate();
  const txs = useTransactions({ cardId: v.cardId, from: date, to: date });
  const rows = txs.data ?? [];
  const remaining = Number(v.remaining);

  return (
    <div
      className={`stack-item${v.overspent ? ' over' : ''}`}
      onClick={() => navigate(`/card/${v.cardId}?date=${date}`)}
    >
      <div className="stack-head">
        <div className="stack-name">
          <span>{v.cardName}</span>
          <span className="type-tag">消费卡</span>
        </div>
        <span style={{ color: 'var(--primary)' }}>›</span>
      </div>
      <div className="card-detail">
        <div className="kv">
          <span>额度</span>
          <span>{v.hasQuota ? fmtMoney(v.quota) : '未设'}</span>
        </div>
        <div className="kv">
          <span>本月已消费</span>
          <b>{fmtMoney(v.spent)}</b>
        </div>
        <div className="kv">
          <span>{v.overspent ? '超支' : '剩余'}</span>
          <b className={v.overspent ? 'neg' : 'pos'}>
            {v.overspent ? fmtMoney(Math.abs(remaining)) : fmtMoney(v.remaining)}
          </b>
        </div>
      </div>

      <div className="divider" />
      <div className="detail-sub">当日流水（{date}）</div>
      {rows.length ? (
        rows.map((t) => (
          <div className="tx" key={t.id}>
            <div>支出{t.category ? ` · ${t.category}` : ''}</div>
            <div className="row-between">
              <span className="amt out">{fmtMoney(t.amount)}</span>
              {t.note ? <span className="meta ml">{t.note}</span> : null}
            </div>
          </div>
        ))
      ) : (
        <div className="muted">当日无消费</div>
      )}
    </div>
  );
}
