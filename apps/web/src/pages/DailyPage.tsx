import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpendMonth, useTransactions } from '../api/hooks';
import { BackupPanel } from '../components/BackupPanel';
import { CreateCardForm } from '../components/CreateCardForm';
import { addDays, fmtDateCN, fmtMoney, todayStr } from '../lib/format';
import type { SpendMonthView } from '../services/spend.service';

export function DailyPage() {
  const [date, setDate] = useState(todayStr());
  const month = date.slice(0, 7);
  const views = useSpendMonth(month);
  const navigate = useNavigate();
  const startX = useRef<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const shift = (d: number) => setDate((cur) => addDays(cur, d));
  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx > 40) shift(-1);
    else if (dx < -40) shift(1);
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 2 }}>
        <span />
        <button className="ghost" aria-label="设置" onClick={() => navigate('/settings')}>
          ⚙️
        </button>
      </div>
      <div className="date-swipe" onPointerDown={onDown} onPointerUp={onUp}>
        <div className="date-header">
          <button className="ghost" onClick={() => shift(-1)} aria-label="前一天">
            ‹
          </button>
          <div className="date-text">
            {fmtDateCN(date)}
            {date !== todayStr() && (
              <button className="today-btn" onClick={() => setDate(todayStr())}>
                回今天
              </button>
            )}
          </div>
          <button className="ghost" onClick={() => shift(1)} aria-label="后一天">
            ›
          </button>
        </div>
        <div className="muted date-hint">← 左右滑动看不同日期 →（消费按 {month} 统计）</div>
      </div>

      <div className="stack">
        {views.data?.length ? (
          views.data.map((v) => <SpendCard key={v.cardId} v={v} date={date} />)
        ) : (
          <div className="card muted">还没有消费卡，点下方「新建消费卡」。</div>
        )}
      </div>

      <div className="spacer" />
      <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? '收起' : '＋ 新建消费卡'}</button>
      {showCreate && (
        <div className="mt">
          <CreateCardForm type="SPEND" placeholder="如：日常消费" />
        </div>
      )}

      <div className="spacer" />
      <BackupPanel />
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
      onClick={() => navigate(`/card/${v.cardId}`)}
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
