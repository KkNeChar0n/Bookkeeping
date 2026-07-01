import { useCardViews } from '../api/hooks';
import { fmtMoney, fmtSigned } from '../lib/format';
import type { CardView } from '../api/types';

export function SummaryPage() {
  const views = useCardViews();
  const all = views.data ?? [];
  const spend = all.filter((v) => v.type === 'SPEND');
  const savings = all.filter((v) => v.type === 'SAVINGS');
  const fund = all.filter((v) => v.type === 'FUND');

  return (
    <div>
      <h1 className="page-title">统计</h1>

      {/* 消费：超支情况 */}
      <div className="section-title">消费 · 超支情况</div>
      <div className="card">
        {spend.length ? (
          spend.map((v) => <SpendRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有消费卡</div>
        )}
      </div>

      {/* 储蓄：实际 vs 预算 差额 */}
      <div className="section-title">储蓄 · 实际与预算差额</div>
      <div className="card">
        {savings.length ? (
          savings.map((v) => <SavingsRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有储蓄卡</div>
        )}
      </div>

      {/* 基金：营收 */}
      <div className="section-title">基金 · 营收</div>
      <div className="card">
        {fund.length ? (
          fund.map((v) => <FundRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有基金</div>
        )}
      </div>
    </div>
  );
}

function SpendRow({ v }: { v: CardView }) {
  const over = Math.max(0, -Number(v.balance));
  return (
    <div className="tx">
      <div>
        <div>{v.cardName}</div>
        <div className="meta">已消费 {fmtMoney(v.spent)} · 余额 {fmtMoney(v.balance)}</div>
      </div>
      {v.overspent ? (
        <span className="amt out">超支 {fmtMoney(over)}</span>
      ) : (
        <span className="amt in">未超支</span>
      )}
    </div>
  );
}

function SavingsRow({ v }: { v: CardView }) {
  const diff = Number(v.diff);
  return (
    <div className="tx">
      <div>
        <div>{v.cardName}</div>
        <div className="meta">实际 {fmtMoney(v.balance)} · 预算 {fmtMoney(v.budgetBalance)}</div>
      </div>
      <span className={`amt ${diff >= 0 ? 'in' : 'out'}`}>{fmtSigned(v.diff)}</span>
    </div>
  );
}

function FundRow({ v }: { v: CardView }) {
  const p = Number(v.profit);
  return (
    <div className="tx">
      <div>
        <div>{v.cardName}</div>
        <div className="meta">市值 {fmtMoney(v.balance)} · 本金 {fmtMoney(v.principal)}</div>
      </div>
      <span className={`amt ${p >= 0 ? 'in' : 'out'}`}>
        {fmtSigned(v.profit)}
        {v.profitPct !== null ? `（${v.profitPct > 0 ? '+' : ''}${v.profitPct}%）` : ''}
      </span>
    </div>
  );
}
