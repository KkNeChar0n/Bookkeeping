import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpendMonth } from '../api/hooks';
import { BackupPanel } from '../components/BackupPanel';
import { CreateCardForm } from '../components/CreateCardForm';
import { addDays, fmtDateCN, fmtMoney, todayStr } from '../lib/format';

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
          views.data.map((v) => {
            const remaining = Number(v.remaining);
            return (
              <div
                key={v.cardId}
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
                    <span>已消费</span>
                    <b>{fmtMoney(v.spent)}</b>
                  </div>
                  <div className="kv">
                    <span>{v.overspent ? '超支' : '剩余'}</span>
                    <b className={v.overspent ? 'neg' : 'pos'}>
                      {v.overspent ? fmtMoney(Math.abs(remaining)) : fmtMoney(v.remaining)}
                    </b>
                  </div>
                </div>
              </div>
            );
          })
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
