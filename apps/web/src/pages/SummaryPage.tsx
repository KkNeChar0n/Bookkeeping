import { useState } from 'react';
import {
  useIncomeCompare,
  useBookkeepingStart,
  useConsumptionReconcileTotals,
  useReconciliation,
  useSavingsSummaryAsOf,
  useSpendPeriod,
  useSpendStats,
} from '../api/hooks';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';
import { BookkeepingScopeNotice } from '../components/BookkeepingScopeNotice';

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
  const consumptionTotals = useConsumptionReconcileTotals(refMonth);

  const spendView = spend.data;
  const savings = savingsCmp.data ?? [];
  const inc = incomeCmp.data;
  const r = recon.data;
  const start = useBookkeepingStart().data;
  const manualOpening = !!start?.manualOpening;
  const consumptionHistory = manualOpening && start?.consumptionHistory === true;
  const fundOpeningPending = manualOpening && !start?.fundOpeningConfirmed;
  const openingMonth = !!start && refMonth === start.startDate.slice(0, 7);
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
        <BookkeepingScopeNotice month={refMonth} />

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
            {spendView.startDate && <div className="muted mt" style={{ fontSize: 12 }}>{consumptionHistory
              ? '上方为所选期间消费；下方累计保留全部历史定额、充值与逐月超支，资产重新起账不截断消费历史。'
              : manualOpening ? `额度与已花包含 ${spendView.startDate.slice(0, 7)} 起账月的全部消费，更早月份仅查询；可在设置中恢复历史消费资金，启用完整累计。` : `额度与已花只计算 ${spendView.startDate} 起账后的新账范围。`}下方分类统计包含所选期间全部消费。</div>}
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
            <div className="muted mt" style={{ fontSize: 12 }}>累计超支为各月 max(已花−当月定额, 0) 之和；超额充值不抵扣超支。这里包含资产起账前的消费资金，但不恢复旧资产对账。</div>
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
        {manualOpening && <div className="muted mt" style={{ fontSize: 12 }}>手工预算期初已包含基金总额，可能集中放在一张卡中；单卡预算与银行余额不能直接对账，差额请看下方总资产。</div>}
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
              {manualOpening ? <span className="muted">仅展示</span> : v.diff !== null ? (
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
        {fundOpeningPending && <div className="warn mt">请先在基金页确认 {start?.startDate.slice(0, 7)} 的开账市值和独立现金，首次净投入为 0。基金基准未确认，对账及“利息/其他”暂不完整。</div>}
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
              {fundOpeningPending ? <b className="muted">未完整</b> : <b className={Number(r.diff) >= 0 ? 'pos' : 'neg'}>{fmtSigned(r.diff)}</b>}
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
              <span>{consumptionHistory ? '消费充值对账余额' : '预充暂存(未花)'}</span>
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
              <span>利息/其他（累计）</span>
              {fundOpeningPending ? <span className="muted">未完整</span> : <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.interest)}
              </span>}
            </div>
            <details className="interest-change">
              <summary className="brk">
                <span>
                  <span className="disclosure-arrow" aria-hidden="true">▸</span>{' '}
                  {openingMonth ? manualOpening ? '起账月新增差额' : '起账后新增差额' : mode === 'month' ? '本月新增差额' : `${refMonth} 新增差额`}
                </span>
                {fundOpeningPending ? <span className="muted">未完整</span> : r.interestChange.amount !== null ? (
                  <span className={Number(r.interestChange.amount) >= 0 ? 'pos' : 'neg'}>
                    {fmtSigned(r.interestChange.amount)}
                  </span>
                ) : (
                  <span className="muted">无法计算</span>
                )}
              </summary>
              <div className="cat-items">
                <div className="brk">
                  <span>{openingMonth ? manualOpening ? '人工重建起点参考' : '已核实起账基准' : `${r.interestChange.previousMonth} 累计`}</span>
                  {r.interestChange.previousInterest !== null ? (
                    <span className={Number(r.interestChange.previousInterest) >= 0 ? 'pos' : 'neg'}>
                      {fmtSigned(r.interestChange.previousInterest)}
                    </span>
                  ) : (
                    <span className="muted">未完整</span>
                  )}
                </div>
                <div className="brk">
                  <span>{refMonth} 累计</span>
                  {fundOpeningPending ? <span className="muted">未完整</span> : <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                    {fmtSigned(r.interest)}
                  </span>}
                </div>
                <div className="muted mt" style={{ fontSize: 12 }}>
                  {openingMonth
                    ? manualOpening
                      ? '新增差额 = 起账月累计 − 起点参考 0；不与旧账上月比较。期初由你手工重建，系统不会自动调平；基金基准确认前无法完整计算。'
                      : '新增差额 = 起账后累计 − 起账基准 0；不与旧账上月比较。'
                    : `新增差额 = ${refMonth} 累计 − ${r.interestChange.previousMonth} 累计。`}
                  这是未解释差额的变化，不等于真实当月利息；预算基准变化、历史补录或修正也可能影响结果。
                  调整全局期初会重算所有月份的累计值。
                </div>
                {r.interestChange.warnings.map((warning) => (
                  <div className="muted mt" style={{ fontSize: 12 }} key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            </details>
            {r.interestChange.unavailableReason && (
              <div className="warn mt">{r.interestChange.unavailableReason}</div>
            )}
            {r.interestChange.warnings.length > 0 && (
              <div className="muted mt" style={{ fontSize: 12 }}>
                存在余额沿用或对账口径变化，新增差额仅供参考；展开可查看来源。
              </div>
            )}
            <div className="muted mt" style={{ fontSize: 12 }}>
              累计截至 {refMonth}，不是所选期间的利息合计。正数表示扣除已解释项后实际偏多，负数表示实际偏少。
            </div>
            <div className="muted mt" style={{ fontSize: 12 }}>
              {manualOpening
                ? '人工预算期初已含开账基金市值和独立现金，不再重复叠加。对账预算先扣固定开账市值，再加当前市值，并扣确认后的累计净投入；实际加当前基金市值及独立现金。基金市值变化不算盈亏，也不会造成对账假差额。'
                : <>基金市值等额进入对账预算基准和实际，不计算盈亏；基金预充是未包含在其他储蓄卡余额中的独立现金，当前余额进入实际{start ? '，起账时的基金现金同时计入预算期初' : ''}；{start ? '起账后' : '累计'}基金净投入从预算基准中扣除，本身不是资产。</>}
              消费超支=逐月
              max(已花−当月消费预算, 0)；{consumptionHistory ? '消费充值对账余额' : '消费预充暂存'}=累计超额充值−累计超支−累计结转（{consumptionHistory ? '仅起账月之后的资产结转' : '累计结转'}{' '}
              {fmtMoney(r.carryover)}）。
              {consumptionHistory && '消费资金仍按完整历史计算结转；起账月及此前的资金已包含在手工期初中，不再重复扣当前余额。对账余额不等同于消费账户实际剩余预充。'}
            </div>
            {!r.savingsFilled && (
              <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
            )}
            {!r.fundMarketValueFilled && !fundOpeningPending && (
              <div className="warn mt">
                该期基金市值尚未填写，总资产暂不完整；市值在对账两边均按 0 占位，因此不会改变差额。
              </div>
            )}
            {!r.fundNetInvestmentFilled && !fundOpeningPending && (
              <div className="warn mt">
                基金净投入尚未确认的月份：
                {r.fundMissingNetInvestmentMonths.join('、')}。对账预算基准和“利息/其他”暂不完整。
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
            {openingMonth && manualOpening ? '开账确认后本月净投入' : mode === 'month' ? '本月净投入' : `${refMonth} 净投入`}{' '}
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
      </>}
    </div>
  );
}
