import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCardViews } from '../api/hooks';
import { CARD_TYPE_LABEL, type CardView } from '../api/types';
import { addDays, fmtDateCN, fmtMoney, fmtSigned, todayStr } from '../lib/format';

function ExpandedDetail({ v }: { v: CardView }) {
  if (v.type === 'FUND') {
    const p = Number(v.profit);
    return (
      <div className="card-detail">
        <div className="kv">
          <span>市值</span>
          <b>{fmtMoney(v.balance)}</b>
        </div>
        <div className="kv">
          <span>本金</span>
          <span>{fmtMoney(v.principal)}</span>
        </div>
        <div className="kv">
          <span>盈亏</span>
          <b className={p >= 0 ? 'pos' : 'neg'}>
            {fmtSigned(v.profit)}
            {v.profitPct !== null ? `（${v.profitPct > 0 ? '+' : ''}${v.profitPct}%）` : ''}
          </b>
        </div>
      </div>
    );
  }
  if (v.type === 'SPEND') {
    return (
      <div className="card-detail">
        <div className="kv">
          <span>预算</span>
          <span>{fmtMoney(v.budgetBalance)}</span>
        </div>
        <div className="kv">
          <span>已消费</span>
          <span>{fmtMoney(v.spent)}</span>
        </div>
        <div className="kv">
          <span>余额</span>
          <b>{fmtMoney(v.balance)}</b>
        </div>
        <div className="kv">
          <span>超支</span>
          <b className={v.overspent ? 'neg' : ''}>
            {v.overspent ? fmtMoney(Math.abs(Number(v.balance))) : '0'}
          </b>
        </div>
      </div>
    );
  }
  // SAVINGS
  return (
    <div className="card-detail">
      <div className="kv">
        <span>余额</span>
        <b>{fmtMoney(v.balance)}</b>
      </div>
      <div className="kv">
        <span>累计收入</span>
        <span className="pos">{fmtMoney(v.income)}</span>
      </div>
      <div className="kv">
        <span>预算</span>
        <span>{fmtMoney(v.budgetBalance)}</span>
      </div>
    </div>
  );
}

export function DailyPage() {
  const [date, setDate] = useState(todayStr());
  const views = useCardViews(date);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const startX = useRef<number | null>(null);

  const shift = (d: number) => setDate((cur) => addDays(cur, d));

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx > 40) shift(-1); // 右滑看前一天
    else if (dx < -40) shift(1); // 左滑看后一天
  };

  const tapCard = (v: CardView) => {
    if (openId === v.cardId) navigate(`/card/${v.cardId}`); // 已展开再点 → 详情
    else setOpenId(v.cardId); // 点开
  };

  return (
    <div>
      <div className="date-header" onPointerDown={onDown} onPointerUp={onUp}>
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
      <div className="muted date-hint">左右滑动看不同日期</div>

      <div className="stack">
        {views.data?.length ? (
          views.data.map((v) => {
            const open = openId === v.cardId;
            const diffNum = Number(v.diff);
            return (
              <div
                key={v.cardId}
                className={`stack-item${open ? ' open' : ''}${v.overspent ? ' over' : ''}`}
                onClick={() => tapCard(v)}
              >
                <div className="stack-head">
                  <div className="stack-name">
                    <span>{v.cardName}</span>
                    <span className="type-tag">{CARD_TYPE_LABEL[v.type]}</span>
                  </div>
                  {!open && (
                    <div className="stack-nums">
                      {v.type === 'FUND' ? (
                        <>
                          <span>{fmtMoney(v.balance)}</span>
                          <span className={Number(v.profit) >= 0 ? 'pos' : 'neg'}>
                            {fmtSigned(v.profit)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>{fmtMoney(v.balance)}</span>
                          <span className={diffNum >= 0 ? 'pos' : 'neg'}>{fmtSigned(v.diff)}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {open && (
                  <>
                    <ExpandedDetail v={v} />
                    <div className="enter-hint">再点一次进入详情 ›</div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <div className="card muted">还没有卡片，去「卡片」页添加。</div>
        )}
      </div>
    </div>
  );
}
