import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpendMonth, useTransactions } from '../api/hooks';
import { addDays, fmtDateCN, fmtMoney, todayStr } from '../lib/format';
import { useCardSlide } from '../lib/useCardSlide';
import type { SpendMonthView } from '../services/spend.service';

export function DailyPage() {
  const [date, setDate] = useState(todayStr());
  const month = date.slice(0, 7);
  const views = useSpendMonth(month);
  const navigate = useNavigate();

  // 整片左右滑动切日期（区分滑动/点击）
  const { drag, instant, handlers, onClickCapture } = useCardSlide((dir) =>
    setDate((cur) => addDays(cur, dir)),
  );

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
        <span className="date-text">{fmtDateCN(date)}</span>
        {/* 透明日期输入盖在上面，点击直接唤起系统年月日选择器 */}
        <input
          type="date"
          aria-label="选择日期"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        />
      </div>
      <div className="muted date-hint">点日期可选年月日 · 在卡片上左右滑动切换日期</div>

      <div className="day-swipe" {...handlers} onClickCapture={onClickCapture}>
        <div
          className="day-slide"
          style={{ transform: `translateX(${drag}px)`, transition: instant ? 'none' : undefined }}
        >
          {views.data?.length ? (
            <div className="stack day-stack">
              {views.data.map((v) => (
                <SpendCard key={v.cardId} v={v} date={date} />
              ))}
            </div>
          ) : (
            <div className="card muted">还没有消费卡，去右上角 ⚙️ 设置里新建。</div>
          )}
        </div>
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
