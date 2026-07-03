import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCardViews,
  useIncomeCompare,
  useReconciliation,
  useSavingsSummaryAsOf,
  useSpendPeriod,
  useSpendStats,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';

export function SummaryPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [monthVal, setMonthVal] = useState(currentMonthStr());
  const [yearVal, setYearVal] = useState(currentMonthStr().slice(0, 4));

  const prefix = mode === 'month' ? monthVal : yearVal;
  const refMonth = mode === 'month' ? monthVal : `${yearVal}-12`;

  const spend = useSpendPeriod(prefix);
  const stats = useSpendStats(prefix);
  const incomeCmp = useIncomeCompare(prefix);
  const recon = useReconciliation(refMonth);
  const savingsCmp = useSavingsSummaryAsOf(refMonth);
  const views = useCardViews();

  const spendRows = spend.data ?? [];
  const savings = savingsCmp.data ?? [];
  const fund = (views.data ?? []).filter((v) => v.type === 'FUND');
  const inc = incomeCmp.data;
  const r = recon.data;

  return (
    <div>
      <h1 className="page-title">统计</h1>

      <div className="card">
        <div className="seg" style={{ marginBottom: 6 }}>
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            按月
          </button>
          <button className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>
            按年
          </button>
        </div>
        {mode === 'month' ? (
          <input type="month" value={monthVal} onChange={(e) => setMonthVal(e.target.value)} />
        ) : (
          <input type="number" min="2000" max="2100" value={yearVal} onChange={(e) => setYearVal(e.target.value)} />
        )}

        {/* 消费超支 */}
        <div className="divider" />
        <div className="detail-sub">消费 · 超支情况</div>
        {spendRows.length ? (
          spendRows.map((v) => (
            <div className="sum-row" key={v.cardId}>
              <span>
                {v.cardName}
                <span className="meta"> 额度{v.hasQuota ? fmtMoney(v.quota) : '未设'} · 已花{fmtMoney(v.spent)}</span>
              </span>
              {v.overspent ? (
                <b className="neg">超支 {fmtMoney(Math.max(0, -Number(v.remaining)))}</b>
              ) : (
                <span className="pos">剩 {fmtMoney(v.remaining)}</span>
              )}
            </div>
          ))
        ) : (
          <div className="muted">没有消费卡</div>
        )}

        {/* 消费分类 */}
        <div className="divider" />
        <div className="detail-sub">消费 · 分类统计</div>
        <div className="sum-row total">
          <span>合计消费</span>
          <b>{fmtMoney(stats.data?.total ?? '0')}</b>
        </div>
        {stats.data?.rows.length ? (
          stats.data.rows.map((row) => (
            <div className="cat-row" key={row.category}>
              <div className="cat-line">
                <span>{row.category}</span>
                <span>
                  {fmtMoney(row.amount)} · {row.pct}%
                </span>
              </div>
              <div className="cat-bar">
                <div className="cat-bar-fill" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="muted mt">该期间没有消费</div>
        )}

        {/* 收入 */}
        <div className="divider" />
        <div className="detail-sub">收入 · 实际与预期</div>
        {inc && (
          <>
            <div className="sum-row">
              <span>预期收入</span>
              <span>{fmtMoney(inc.expected)}</span>
            </div>
            <div className="sum-row">
              <span>实际收入</span>
              <span>{fmtMoney(inc.actual)}</span>
            </div>
            <div className="sum-row total">
              <span>差额（实际−预期）</span>
              <b className={Number(inc.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(inc.diff)}</b>
            </div>
          </>
        )}

        {/* 储蓄 */}
        <div className="divider" />
        <div className="detail-sub">储蓄 · 实际与预期（截至 {refMonth}）</div>
        {savings.length ? (
          savings.map((v) => (
            <div className="sum-row" key={v.cardId}>
              <span>
                {v.cardName}
                <span className="meta"> 实际{v.actual !== null ? fmtMoney(v.actual) : '未填'} · 预期{fmtMoney(v.expected)}</span>
              </span>
              {v.diff !== null ? (
                <b className={Number(v.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(v.diff)}</b>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          ))
        ) : (
          <div className="muted">没有储蓄卡</div>
        )}

        {/* 基金 */}
        <div className="divider" />
        <div className="detail-sub">基金 · 营收</div>
        {fund.length ? (
          fund.map((v) => (
            <div className="sum-row" key={v.cardId} onClick={() => navigate(`/card/${v.cardId}`)} style={{ cursor: 'pointer' }}>
              <span>
                {v.cardName} ›<span className="meta"> 市值{fmtMoney(v.balance)} · 本金{fmtMoney(v.principal)}</span>
              </span>
              <b className={Number(v.profit) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(v.profit)}
                {v.profitPct !== null ? `(${v.profitPct > 0 ? '+' : ''}${v.profitPct}%)` : ''}
              </b>
            </div>
          ))
        ) : (
          <div className="muted">没有基金</div>
        )}

        {/* 对账 */}
        <div className="divider" />
        <div className="detail-sub">对账 · 总资产（截至 {refMonth}）</div>
        {r ? (
          <>
            <div className="sum-row">
              <span>预算总资产</span>
              <span>{fmtMoney(r.budgetTotal)}</span>
            </div>
            <div className="sum-row">
              <span>实际总资产</span>
              <span>{fmtMoney(r.actualTotal)}</span>
            </div>
            <div className="sum-row total">
              <span>差额（实际−预算）</span>
              <b className={Number(r.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.diff)}</b>
            </div>
            <div className="brk-title">差额拆解</div>
            <div className="brk">
              <span>基金盈亏</span>
              <span className={Number(r.fundProfit) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.fundProfit)}</span>
            </div>
            <div className="brk">
              <span>超额支出(累计)</span>
              <span className={Number(r.overspend) > 0 ? 'neg' : ''}>
                {Number(r.overspend) > 0 ? `−${fmtMoney(r.overspend)}` : '0.00'}
              </span>
            </div>
            <div className="brk">
              <span>收入差额(累计)</span>
              <span className={Number(r.incomeDiff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.incomeDiff)}</span>
            </div>
            <div className="brk">
              <span>利息/其他</span>
              <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.interest)}</span>
            </div>
            <div className="muted mt" style={{ fontSize: 12 }}>
              超额支出=你在储蓄卡里记的、额外充给消费卡的钱。
            </div>
            {!r.savingsFilled && (
              <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
            )}
          </>
        ) : (
          <div className="muted">暂无数据</div>
        )}
      </div>
    </div>
  );
}
