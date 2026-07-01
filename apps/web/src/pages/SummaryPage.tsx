import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCardViews, useSavingsSummary, useSpendMonth } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import type { SavingsSummaryRow } from '../services/savingsSummary.service';
import type { SpendMonthView } from '../services/spend.service';

export function SummaryPage() {
  const month = currentMonthStr();
  const spend = useSpendMonth(month);
  const savingsSummary = useSavingsSummary();
  const views = useCardViews();
  const navigate = useNavigate();
  const [showCreateFund, setShowCreateFund] = useState(false);

  const spendRows = spend.data ?? [];
  const savings = savingsSummary.data ?? [];
  const fund = (views.data ?? []).filter((v) => v.type === 'FUND');

  return (
    <div>
      <h1 className="page-title">统计</h1>

      <div className="section-title">消费 · 超支情况（{month}）</div>
      <div className="card">
        {spendRows.length ? (
          spendRows.map((v) => <SpendRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有消费卡</div>
        )}
      </div>

      <div className="section-title">储蓄 · 实际与预期差额</div>
      <div className="card">
        {savings.length ? (
          savings.map((v) => <SavingsRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有储蓄卡</div>
        )}
      </div>

      <div className="section-title">基金 · 营收</div>
      <div className="card">
        {fund.length ? (
          fund.map((v) => (
            <div className="tx" key={v.cardId} onClick={() => navigate(`/card/${v.cardId}`)} style={{ cursor: 'pointer' }}>
              <div>
                <div>{v.cardName} ›</div>
                <div className="meta">市值 {fmtMoney(v.balance)} · 本金 {fmtMoney(v.principal)}</div>
              </div>
              <span className={`amt ${Number(v.profit) >= 0 ? 'in' : 'out'}`}>
                {fmtSigned(v.profit)}
                {v.profitPct !== null ? `（${v.profitPct > 0 ? '+' : ''}${v.profitPct}%）` : ''}
              </span>
            </div>
          ))
        ) : (
          <div className="muted">没有基金</div>
        )}
      </div>
      <div className="mt">
        <button onClick={() => setShowCreateFund((s) => !s)}>
          {showCreateFund ? '收起' : '＋ 新建基金'}
        </button>
        {showCreateFund && (
          <div className="mt">
            <CreateCardForm type="FUND" placeholder="如：某某基金" />
          </div>
        )}
      </div>
    </div>
  );
}

function SpendRow({ v }: { v: SpendMonthView }) {
  const over = Math.max(0, -Number(v.remaining));
  return (
    <div className="tx">
      <div>
        <div>{v.cardName}</div>
        <div className="meta">
          额度 {v.hasQuota ? fmtMoney(v.quota) : '未设'} · 已消费 {fmtMoney(v.spent)}
        </div>
      </div>
      {v.overspent ? (
        <span className="amt out">超支 {fmtMoney(over)}</span>
      ) : (
        <span className="amt in">剩 {fmtMoney(v.remaining)}</span>
      )}
    </div>
  );
}

function SavingsRow({ v }: { v: SavingsSummaryRow }) {
  const diff = v.diff !== null ? Number(v.diff) : null;
  return (
    <div className="tx">
      <div>
        <div>{v.cardName}</div>
        <div className="meta">
          {v.month} · 实际 {v.actual !== null ? fmtMoney(v.actual) : '未填'} · 预期{' '}
          {fmtMoney(v.expected)}
        </div>
      </div>
      {diff !== null ? (
        <span className={`amt ${diff >= 0 ? 'in' : 'out'}`}>{fmtSigned(v.diff!)}</span>
      ) : (
        <span className="amt neutral">—</span>
      )}
    </div>
  );
}
