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
        {manualOpening && <div className="muted mt" style={{ fontSize: 12 }}>手工预算期初是一次性的总资产起点，已包含起账时的基金市值；基金资金卡仍按普通储蓄卡展示。单卡预算与银行余额不一定能直接对账，差额请看下方总资产。</div>}
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
              <span>资产变动/其他（累计）</span>
              <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.interest)}
              </span>
            </div>
            <details className="interest-change">
              <summary className="brk">
                <span>
                  <span className="disclosure-arrow" aria-hidden="true">▸</span>{' '}
                  {openingMonth ? manualOpening ? '起账月新增差额' : '起账后新增差额' : mode === 'month' ? '本月新增差额' : `${refMonth} 新增差额`}
                </span>
                {r.interestChange.amount !== null ? (
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
                  <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                    {fmtSigned(r.interest)}
                  </span>
                </div>
                <div className="muted mt" style={{ fontSize: 12 }}>
                  {openingMonth
                    ? manualOpening
                      ? '新增差额 = 起账月累计 − 起点参考 0；不与旧账上月比较。期初由你手工重建，系统不会自动调平。'
                      : '新增差额 = 起账后累计 − 起账基准 0；不与旧账上月比较。'
                    : `新增差额 = ${refMonth} 累计 − ${r.interestChange.previousMonth} 累计。`}
                  这是未解释资产变化，不等于真实当月利息或单独计算的基金盈亏；基金市值变化、预算基准变化、历史补录或修正都可能影响结果。
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
              累计截至 {refMonth}。该项可能包含基金市值涨跌、银行利息、历史补录及其它未解释变化；正数表示扣除已解释项后实际偏多，负数表示实际偏少。
            </div>
            <div className="muted mt" style={{ fontSize: 12 }}>
              对账预算基准 = 所有储蓄卡预算预期合计；实际总资产 = 所有储蓄卡真实余额 + 基金当前市值。
              基金资金现金请放在普通储蓄卡中：银行卡之间转账，以及资金卡买入基金，都是资产内部移动，不需要另记基金预算支出。基金市值涨跌会进入“资产变动/其他”。
              消费超支=逐月
              max(已花−当月消费预算, 0)；{consumptionHistory ? '消费充值对账余额' : '消费预充暂存'}=累计超额充值−累计超支−累计结转（{consumptionHistory ? '仅起账月之后的资产结转' : '累计结转'}{' '}
              {fmtMoney(r.carryover)}）。
              {consumptionHistory && '消费资金仍按完整历史计算结转；起账月及此前的资金已包含在手工期初中，不再重复扣当前余额。对账余额不等同于消费账户实际剩余预充。'}
            </div>
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
        <div className="muted mt" style={{ fontSize: 12 }}>
          待投资现金不在这里填写；请新建普通储蓄卡并按月填写真实余额。基金页只维护市值。
        </div>
      </div>
      </>}
    </div>
  );
}
