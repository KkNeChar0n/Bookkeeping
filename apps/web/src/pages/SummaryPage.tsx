import { useState } from 'react';
import {
  useIncomeCompare,
  useBookkeepingStart,
  useConsumptionReconcileTotals,
  useReconciliation,
  useReconciliationBreakdown,
  useSavingsSummaryAsOf,
  useSpendPeriod,
  useSpendStats,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import type { ReconciliationMonthBreakdown } from '../services/reconciliation.service';

export function SummaryPage() {
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [monthVal, setMonthVal] = useState(currentMonthStr());
  const [yearVal, setYearVal] = useState(currentMonthStr().slice(0, 4));
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [showSpendMonths, setShowSpendMonths] = useState(false);
  const toggleCat = (cat: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const prefix = mode === 'month' ? monthVal : yearVal;
  const refMonth = mode === 'month' ? monthVal : `${yearVal}-12`;

  const spend = useSpendPeriod(prefix);
  const stats = useSpendStats(prefix);
  const incomeCmp = useIncomeCompare(prefix);
  const recon = useReconciliation(refMonth);
  const breakdown = useReconciliationBreakdown(refMonth);
  const savingsCmp = useSavingsSummaryAsOf(refMonth);
  const consumptionTotals = useConsumptionReconcileTotals(refMonth);

  const spendView = spend.data;
  const savings = savingsCmp.data ?? [];
  const inc = incomeCmp.data;
  const r = recon.data;
  const start = useBookkeepingStart().data;
  const manualOpening = !!start?.manualOpening;
  const consumptionHistory = manualOpening && start?.consumptionHistory === true;
  const historical = !!start && refMonth < start.startDate.slice(0, 7);
  const assetsAvailable = !historical && r?.reconciliationAvailable !== false;

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
          <input
            type="number"
            min="2000"
            max="2100"
            value={yearVal}
            onChange={(e) => setYearVal(e.target.value)}
          />
        )}
        {/* 消费超支 */}
        <div className="divider" />
        <div className="detail-sub">消费 · 超支情况</div>
        {spendView?.historicalOnly ? (
          <div className="muted">历史消费合计 {fmtMoney(spendView.totalSpent ?? stats.data?.total ?? '0')}；旧消费不再参与新账额度和超支。</div>
        ) : spendView ? (
          <>
            <div
              className="sum-row"
              onClick={() => setShowSpendMonths((open) => !open)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {spendView.startDate && !consumptionHistory ? '新账消费' : '全局消费'}
                <span className="meta">
                  {' '}
                  {mode === 'year' ? '期间额度' : '当月额度'}
                  {spendView.hasQuota ? fmtMoney(spendView.quota) : '未设'} · 已花
                  {fmtMoney(spendView.spent)} · 超额充值{fmtMoney(spendView.excess)}
                </span>
                <span className="muted"> {showSpendMonths ? '▾' : '▸'}</span>
              </span>
              {spendView.overspent ? (
                <b className="neg">超支 {fmtMoney(spendView.overspend)}</b>
              ) : (
                <span className={Number(spendView.remaining) >= 0 ? 'pos' : 'neg'}>
                  剩 {fmtMoney(spendView.remaining)}
                </span>
              )}
            </div>
            {showSpendMonths && (
              <div className="cat-items">
                {spendView.months.map((row) => (
                  <div className="tx" key={row.month}>
                    <span>
                      {row.month}
                      <span className="meta">
                        {' '}
                        {row.historicalOnly ? `历史消费 ${fmtMoney(row.totalSpent ?? '0')}` : <>额度 {row.hasQuota ? fmtMoney(row.quota) : '未设'} · {row.startDate && !consumptionHistory ? '新账已花' : '已花'} {fmtMoney(row.spent)}</>}
                      </span>
                    </span>
                    <b className={row.overspent ? 'neg' : ''}>
                      {row.historicalOnly ? '仅历史查询' : row.overspent ? `超支 ${fmtMoney(row.overspend)}` : '未超支'}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="muted">暂无消费数据</div>
        )}
        {consumptionHistory && consumptionTotals.data && (
          <div className="cat-items">
            <div className="detail-sub mt">完整消费累计（截至 {refMonth}）</div>
            <div className="sum-row"><span>累计消费定额</span><span>{fmtMoney(consumptionTotals.data.budget)}</span></div>
            <div className="sum-row"><span>累计超额充值</span><span>{fmtMoney(consumptionTotals.data.excess)}</span></div>
            <div className="sum-row"><span>累计已消费</span><span>{fmtMoney(consumptionTotals.data.spent)}</span></div>
            <div className="sum-row total"><span>累计消费超支</span><b className={Number(consumptionTotals.data.overspend) > 0 ? 'neg' : ''}>{fmtMoney(consumptionTotals.data.overspend)}</b></div>
          </div>
        )}

        {/* 消费分类 */}
        <div className="divider" />
        <div className="detail-sub">消费 · 分类统计</div>
        <div className="sum-row total">
          <span>合计消费</span>
          <b>{fmtMoney(stats.data?.total ?? '0')}</b>
        </div>
        {stats.data?.rows.length ? (
          stats.data.rows.map((row) => {
            const open = openCats.has(row.category);
            return (
              <div key={row.category}>
                <div
                  className="cat-row"
                  onClick={() => toggleCat(row.category)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cat-line">
                    <span>
                      {row.category} <span className="muted">{open ? '▾' : '▸'}</span>
                    </span>
                    <span>
                      {fmtMoney(row.amount)} · {row.pct}%
                    </span>
                  </div>
                  <div className="cat-bar">
                    <div className="cat-bar-fill" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
                {open && (
                  <div className="cat-items">
                    {row.items.map((it) => (
                      <div className="tx" key={it.id}>
                        <span className="meta">
                          {it.date}
                          {it.note ? ` · ${it.note}` : ''}
                        </span>
                        <span className="amt out">{fmtMoney(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="muted mt">该期间没有消费</div>
        )}

        {/* 收入 */}
        {assetsAvailable && <>
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
        <div className="detail-sub">储蓄 · {manualOpening ? '各卡金额' : '实际与预期'}（截至 {refMonth}）</div>
        {savings.length ? (
          savings.map((v) => (
            <div className="sum-row" key={v.cardId}>
              <span>
                {v.cardName}
                <span className="meta">
                  {' '}
                  {v.isFundCash
                    ? `实际${v.actual !== null ? fmtMoney(v.actual) : '未填'}`
                    : <>实际{v.actual !== null ? fmtMoney(v.actual) : '未填'} · 预期{fmtMoney(v.expected)}</>}
                </span>
              </span>
              {v.isFundCash || manualOpening ? <span className="muted">仅展示</span> : v.diff !== null ? (
                <b className={Number(v.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(v.diff)}</b>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          ))
        ) : (
          <div className="muted">没有储蓄卡</div>
        )}

        {/* 对账 */}
        <div className="divider" />
        <div className="detail-sub">对账 · 总资产（截至 {refMonth}）</div>
        {r ? (
          <>
            <div className="sum-row">
              <span>对账预算基准</span>
              <span>{fmtMoney(r.budgetTotal)}</span>
            </div>
            <div className="sum-row">
              <span>实际总资产</span>
              <span>{fmtMoney(r.actualTotal)}</span>
            </div>
            <div className="sum-row total">
              <span>差额（实际−基准）</span>
              <b className={Number(r.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.diff)}</b>
            </div>
            <div className="brk-title">差额拆解</div>
            <div className="brk">
              <span>预算余额</span>
              <span className={Number(r.prepaid) > 0 ? 'neg' : Number(r.prepaid) < 0 ? 'pos' : ''}>
                {Number(r.prepaid) === 0 ? '0.00' : fmtSigned(-Number(r.prepaid))}
              </span>
            </div>
            <BreakdownGroup
              title="消费超支"
              total={r.overspend}
              rows={breakdown.data?.months ?? []}
              field="overspend"
              invert
              refMonth={refMonth}
            />
            <BreakdownGroup
              title="收入差额"
              total={r.incomeDiff}
              rows={breakdown.data?.months ?? []}
              field="incomeDiff"
              refMonth={refMonth}
            />
            <BreakdownGroup
              title="资产变动"
              total={r.interest}
              rows={breakdown.data?.months ?? []}
              field="assetChange"
              refMonth={refMonth}
            />
            {!r.savingsFilled && (
              <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
            )}
            {!r.fundMarketValueFilled && (
              <div className="warn mt">
                该期基金市值明确留空，总资产暂不完整；当前按 0 占位，差额也会暂时少计这部分资产。
              </div>
            )}
          </>
        ) : (
          <div className="muted">暂无数据</div>
        )}
        </>}
      </div>

      {assetsAvailable && <>
      <div className="card">
        <div className="detail-sub">基金当前市值（截至 {refMonth}）</div>
        <div className="sum-row">
          <span>当前市值</span>
          {r?.fundMarketValueFilled === false ? (
            <span className="muted">未填</span>
          ) : (
            <span>{fmtMoney(r?.fundMarketValue ?? '0')}</span>
          )}
        </div>
        <div className="sum-row total">
          <span>计入实际总资产</span>
          <b>{r?.fundMarketValueFilled === false ? '未完整' : fmtMoney(r?.fundMarketValue ?? '0')}</b>
        </div>
      </div>
      </>}
    </div>
  );
}

function BreakdownGroup({
  title,
  total,
  rows,
  field,
  invert = false,
  refMonth,
}: {
  title: string;
  total: string;
  rows: ReconciliationMonthBreakdown[];
  field: 'overspend' | 'incomeDiff' | 'assetChange';
  invert?: boolean;
  refMonth: string;
}) {
  return (
    <>
      <div className="brk brk-group">
        <span>{title}</span>
        <BreakdownValue value={total} invert={invert} />
      </div>
      {rows.length > 0 && (
        <div className="cat-items brk-months">
          {rows.map((row) => (
            <div className="brk" key={field + '-' + row.month}>
              <span>{formatBreakdownMonth(row.month, refMonth)}</span>
              <BreakdownValue value={row[field]} invert={invert} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BreakdownValue({ value, invert = false }: { value: string | null; invert?: boolean }) {
  if (value === null) return <span className="muted">无法计算</span>;
  const amount = Number(value) * (invert ? -1 : 1);
  return (
    <span className={amount > 0 ? 'pos' : amount < 0 ? 'neg' : ''}>
      {amount === 0 ? '0.00' : fmtSigned(amount)}
    </span>
  );
}

function formatBreakdownMonth(month: string, refMonth: string): string {
  const label = String(Number(month.slice(5, 7))) + '月';
  return month.slice(0, 4) === refMonth.slice(0, 4) ? label : month.slice(0, 4) + '年' + label;
}
