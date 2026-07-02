import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCardViews,
  useIncomeCompare,
  useReconciliation,
  useSavingsSummary,
  useSpendPeriod,
  useSpendStats,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import type { SavingsSummaryRow } from '../services/savingsSummary.service';
import type { SpendMonthView } from '../services/spend.service';

export function SummaryPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [monthVal, setMonthVal] = useState(currentMonthStr());
  const [yearVal, setYearVal] = useState(currentMonthStr().slice(0, 4));

  const prefix = mode === 'month' ? monthVal : yearVal; // 'YYYY-MM' | 'YYYY'
  const refMonth = mode === 'month' ? monthVal : `${yearVal}-12`;

  const spend = useSpendPeriod(prefix);
  const stats = useSpendStats(prefix);
  const incomeCmp = useIncomeCompare(prefix);
  const recon = useReconciliation(refMonth);
  const views = useCardViews();
  const savingsSummary = useSavingsSummary();

  const spendRows = spend.data ?? [];
  const savings = savingsSummary.data ?? [];
  const fund = (views.data ?? []).filter((v) => v.type === 'FUND');
  const r = recon.data;

  return (
    <div>
      <h1 className="page-title">统计</h1>

      {/* 统一按月/按年筛选 */}
      <div className="card">
        <div className="seg" style={{ marginBottom: 10 }}>
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
      </div>

      <div className="section-title">消费 · 超支情况（{prefix}）</div>
      <div className="card">
        {spendRows.length ? (
          spendRows.map((v) => <SpendRow key={v.cardId} v={v} />)
        ) : (
          <div className="muted">没有消费卡</div>
        )}
      </div>

      <div className="section-title">消费 · 分类统计（{prefix}）</div>
      <div className="card">
        <div className="kv">
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
      </div>

      <div className="section-title">收入 · 实际与预期（{prefix}）</div>
      <div className="card">
        {incomeCmp.data ? (
          <table>
            <tbody>
              <tr>
                <td>预期收入</td>
                <td>{fmtMoney(incomeCmp.data.expected)}</td>
              </tr>
              <tr>
                <td>实际收入</td>
                <td>{fmtMoney(incomeCmp.data.actual)}</td>
              </tr>
              <tr>
                <td>
                  <strong>差额（实际−预期）</strong>
                </td>
                <td>
                  <strong className={Number(incomeCmp.data.diff) >= 0 ? 'pos' : 'neg'}>
                    {fmtSigned(incomeCmp.data.diff)}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="muted">暂无数据</div>
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

      {/* 对账：截至所选期末 */}
      <div className="section-title">对账 · 总资产（截至 {refMonth}）</div>
      <div className="card">
        {r ? (
          <table>
            <tbody>
              <tr>
                <td>预算总资产</td>
                <td>{fmtMoney(r.budgetTotal)}</td>
              </tr>
              <tr>
                <td>实际总资产</td>
                <td>{fmtMoney(r.actualTotal)}</td>
              </tr>
              <tr>
                <td>
                  <strong>差额（实际−预算）</strong>
                </td>
                <td>
                  <strong className={Number(r.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.diff)}</strong>
                </td>
              </tr>
              <tr>
                <td className="muted">· 基金盈亏</td>
                <td className={Number(r.fundProfit) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.fundProfit)}</td>
              </tr>
              <tr>
                <td className="muted">· 消费超支(累计)</td>
                <td className={Number(r.overspend) > 0 ? 'neg' : ''}>
                  {Number(r.overspend) > 0 ? `−${fmtMoney(r.overspend)}` : '0.00'}
                </td>
              </tr>
              <tr>
                <td className="muted">· 收入差额(累计)</td>
                <td className={Number(r.incomeDiff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.incomeDiff)}</td>
              </tr>
              <tr>
                <td className="muted">· 利息/其他</td>
                <td className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.interest)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="muted">暂无数据</div>
        )}
        {r && !r.savingsFilled && (
          <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
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
          {v.month} · 实际 {v.actual !== null ? fmtMoney(v.actual) : '未填'} · 预期 {fmtMoney(v.expected)}
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
