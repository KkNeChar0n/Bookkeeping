import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSpendMonth, useTransactions } from '../api/hooks';
import { VIRTUAL_CONSUMPTION_CARD_ID } from '../domain/consumption';
import { addDays, fmtDateCN, fmtMoney, todayStr } from '../lib/format';
import { useCardSlide } from '../lib/useCardSlide';

/**
 * 记账首页只负责选择日期和查看摘要：左右滑动切日期，点击摘要后才进入左滑记账页。
 */
export function DailyPage() {
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || todayStr());
  const navigate = useNavigate();
  const view = useSpendMonth(date.slice(0, 7));
  const transactions = useTransactions({
    cardId: VIRTUAL_CONSUMPTION_CARD_ID,
    from: date,
    to: date,
  });
  const { drag, instant, handlers, onClickCapture } = useCardSlide((direction) =>
    setDate((current) => addDays(current, direction)),
  );

  const current = view.data;
  const remaining = Number(current?.remaining ?? 0);
  const rows = transactions.data ?? [];

  return (
    <div className="day-page">
      <div className="row-between" style={{ marginBottom: 2 }}>
        {date !== todayStr() ? (
          <button className="today-btn" onClick={() => setDate(todayStr())}>回今天</button>
        ) : <span />}
        <button className="ghost" aria-label="设置" onClick={() => navigate('/settings')}>⚙️</button>
      </div>

      <div className="date-header" style={{ justifyContent: 'center', position: 'relative' }}>
        <span className="date-text">{fmtDateCN(date)}</span>
        <input
          type="date"
          aria-label="选择日期"
          value={date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
        />
      </div>
      <div className="muted date-hint">点日期可选年月日 · 在卡片上左右滑动切换日期</div>

      <div className="day-swipe" {...handlers} onClickCapture={onClickCapture}>
        <div className="day-slide" style={{ transform: `translateX(${drag}px)`, transition: instant ? 'none' : undefined }}>
          <div
            className={`stack-item${current?.overspent ? ' over' : ''}`}
            onClick={() => navigate(`/consume?date=${date}`)}
          >
            <div className="stack-head">
              <div className="stack-name"><span>消费</span></div>
              <span style={{ color: 'var(--primary)' }}>›</span>
            </div>
            <div className="card-detail">
              <div className="kv"><span>额度</span><span>{current?.hasQuota ? fmtMoney(current.quota) : '未设'}</span></div>
              <div className="kv"><span>本月已消费</span><b>{fmtMoney(current?.spent ?? '0')}</b></div>
              <div className="kv"><span>本月剩余</span><b className={remaining < 0 ? 'neg' : 'pos'}>{fmtMoney(remaining)}</b></div>
              {Number(current?.overspend ?? 0) > 0 && (
                <div className="kv"><span>超支</span><b className="neg">{fmtMoney(current?.overspend ?? '0')}</b></div>
              )}
            </div>

            <div className="divider" />
            <div className="detail-sub">当日流水（{date}）</div>
            {rows.length ? rows.map((row) => (
              <div className="tx" key={row.id}>
                <div>支出{row.category ? ` · ${row.category}` : ''}</div>
                <div className="row-between">
                  <span className="amt out">{fmtMoney(row.amount)}</span>
                  {row.note ? <span className="meta ml">{row.note}</span> : null}
                </div>
              </div>
            )) : <div className="muted">当日无消费</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
