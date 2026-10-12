import { useState } from 'react';
import {
  useIncomeCompare,
  useReconciliation,
  useSavingsSummaryAsOf,
  useSpendPeriod,
  useSpendStats,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';

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
  const savingsCmp = useSavingsSummaryAsOf(refMonth);

  const spendView = spend.data;
  const savings = savingsCmp.data ?? [];
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
        {spendView ? (
          <>
            <div
              className="sum-row"
              onClick={() => setShowSpendMonths((open) => !open)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                全局消费
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
                        额度 {row.hasQuota ? fmtMoney(row.quota) : '未设'} · 已花{' '}
                        {fmtMoney(row.spent)}
                      </span>
                    </span>
                    <b className={row.overspent ? 'neg' : ''}>
                      {row.overspent ? `超支 ${fmtMoney(row.overspend)}` : '未超支'}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="muted">暂无消费数据</div>
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
                <span className="meta">
                  {' '}
                  实际{v.actual !== null ? fmtMoney(v.actual) : '未填'} · 预期{fmtMoney(v.expected)}
                </span>
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
              <span>消费超支(累计)</span>
              <span
                className={Number(r.overspend) > 0 ? 'neg' : Number(r.overspend) < 0 ? 'pos' : ''}
              >
                {Number(r.overspend) === 0 ? '0.00' : fmtSigned(-Number(r.overspend))}
              </span>
            </div>
            <div className="brk">
              <span>预充暂存(未花)</span>
              <span className={Number(r.prepaid) > 0 ? 'neg' : Number(r.prepaid) < 0 ? 'pos' : ''}>
                {Number(r.prepaid) === 0 ? '0.00' : fmtSigned(-Number(r.prepaid))}
              </span>
            </div>
            <div className="brk">
              <span>收入差额(累计)</span>
              <span className={Number(r.incomeDiff) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.incomeDiff)}
              </span>
            </div>
            <div className="brk">
              <span>利息/其他</span>
              <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.interest)}
              </span>
            </div>
            <div className="muted mt" style={{ fontSize: 12 }}>
              基金市值等额进入对账预算基准和实际，不计算盈亏；基金预充是未包含在其他储蓄卡余额中的独立现金，只进入实际；累计基金净投入从预算基准中扣除，本身不是资产。消费超支=逐月
              max(已花−当月消费预算, 0)；消费预充暂存=累计超额充值−累计超支−累计结转（累计结转{' '}
              {fmtMoney(r.carryover)}）。
            </div>
            {!r.savingsFilled && (
              <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
            )}
            {!r.fundMarketValueFilled && (
              <div className="warn mt">
                该期基金市值尚未填写，总资产暂不完整；市值在对账两边均按 0 占位，因此不会改变差额。
              </div>
            )}
            {!r.fundNetInvestmentFilled && (
              <div className="warn mt">
                基金净投入尚未确认的月份：
                {r.fundMissingNetInvestmentMonths.join('、')}。对账预算基准和“利息/其他”暂不完整。
              </div>
            )}
          </>
        ) : (
          <div className="muted">暂无数据</div>
        )}
      </div>

      <div className="card">
        <div className="detail-sub">基金储蓄池（截至 {refMonth}）</div>
        <div className="sum-row">
          <span>当前市值</span>
          {r?.fundMarketValueFilled === false ? (
            <span className="muted">未填</span>
          ) : (
            <span>{fmtMoney(r?.fundMarketValue ?? '0')}</span>
          )}
        </div>
        <div className="sum-row">
          <span>预充金额</span>
          <span>{fmtMoney(r?.fundPrepaid ?? '0')}</span>
        </div>
        <div className="sum-row total">
          <span>{r?.fundMarketValueFilled === false ? '已填部分合计' : '合计'}</span>
          <b>{fmtMoney(r?.fundTotal ?? '0')}</b>
        </div>
        <div className="sum-row">
          <span>
            {mode === 'month' ? '本月净投入' : `${refMonth} 净投入`}{' '}
            <span className="meta">非资产项</span>
          </span>
          {r?.fundFlowBaselineMonth === refMonth ? (
            <span className="muted">历史起点</span>
          ) : r?.fundNetInvestment !== null && r?.fundNetInvestment !== undefined ? (
            <span className={Number(r.fundNetInvestment) >= 0 ? 'pos' : 'neg'}>
              {Number(r.fundNetInvestment) === 0 ? '0.00' : fmtSigned(r.fundNetInvestment)}
            </span>
          ) : (
            <span className="muted">未确认</span>
          )}
        </div>
        <div className="sum-row">
          <span>
            {r?.fundFlowBaselineMonth ? '自起点后累计已确认净投入' : '累计已确认净投入'}{' '}
            <span className="meta">非资产项</span>
          </span>
          <span className={Number(r?.fundCumulativeNetInvestment ?? 0) >= 0 ? 'pos' : 'neg'}>
            {Number(r?.fundCumulativeNetInvestment ?? 0) === 0
              ? '0.00'
              : fmtSigned(r?.fundCumulativeNetInvestment ?? '0')}
          </span>
        </div>
        {r?.fundFlowBaselineMonth && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            历史对账起点：{r.fundFlowBaselineMonth}
            。净投入只从下一月开始累计；起点不会抹平已有差额。
          </div>
        )}
      </div>
    </div>
  );
}
