import { useNavigate } from 'react-router-dom';
import {
  useCardViews,
  useReconciliation,
  useSavingsSummary,
  useSpendMonth,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import type { SavingsSummaryRow } from '../services/savingsSummary.service';
import type { SpendMonthView } from '../services/spend.service';

export function SummaryPage() {
  const month = currentMonthStr();
  const spend = useSpendMonth(month);
  const savingsSummary = useSavingsSummary();
  const views = useCardViews();
  const recon = useReconciliation();
  const navigate = useNavigate();

  const spendRows = spend.data ?? [];
  const savings = savingsSummary.data ?? [];
  const fund = (views.data ?? []).filter((v) => v.type === 'FUND');
  const r = recon.data;

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
      {/* 对账块 */}
      <div className="section-title">对账（总资产：储蓄 + 基金）</div>
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
                <td className="muted">· 消费超支</td>
                <td className={Number(r.overspend) > 0 ? 'neg' : ''}>
                  {Number(r.overspend) > 0 ? `−${fmtMoney(r.overspend)}` : '0.00'}
                </td>
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
          <div className="warn mt">部分储蓄卡当月还没填真实金额，总资产/差额暂不完整。</div>
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
