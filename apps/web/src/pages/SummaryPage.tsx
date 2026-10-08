import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useFundMonthsAsOf,
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
  const fundMonths = useFundMonthsAsOf(refMonth);

  const spendView = spend.data;
  const savings = savingsCmp.data ?? [];
  const fund = fundMonths.data ?? [];
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
              <span className={Number(r.fundProfit) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.fundProfit)}
              </span>
            </div>
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
              <span>其他差额（不含基金注资）</span>
              <span className={Number(r.interest) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(r.interest)}
              </span>
            </div>
            <div className="muted mt" style={{ fontSize: 12 }}>
              预算总资产=储蓄预期+基金期初本金；实际总资产=储蓄实际+所选月份基金市值。消费超支=逐月
              max(已花−当月消费预算, 0)；预充暂存=累计超额充值−累计超支−累计结转（累计结转{' '}
              {fmtMoney(r.carryover)}）。
            </div>
            {!r.savingsFilled && (
              <div className="warn mt">部分储蓄卡未填该期真实额，总资产/差额暂不完整。</div>
            )}
            {!r.fundsFilled && (
              <div className="warn mt">部分基金在该期没有月度快照，暂按期初本金计算。</div>
            )}
          </>
        ) : (
          <div className="muted">暂无数据</div>
        )}
      </div>

      <div className="card">
        <div className="detail-sub">基金 · 本金与市值（截至 {refMonth}）</div>
        {fund.length ? (
          fund.map((view) => (
            <div
              className="sum-row"
              key={view.fundCardId}
              onClick={() => navigate(`/card/${view.fundCardId}`)}
              style={{ cursor: 'pointer' }}
            >
              <span>
                {view.fundCardName} ›
                <span className="meta">
                  {' '}
                  市值{fmtMoney(view.value)} · 本金{fmtMoney(view.principal)} · {view.month}
                  {!view.filled ? '（未填，按期初）' : ''}
                </span>
              </span>
              <b className={Number(view.profit) >= 0 ? 'pos' : 'neg'}>
                {fmtSigned(view.profit)}
                {view.profitPct !== null
                  ? `(${view.profitPct > 0 ? '+' : ''}${view.profitPct}%)`
                  : ''}
              </b>
            </div>
          ))
        ) : (
          <div className="muted">没有基金</div>
        )}
      </div>
    </div>
  );
}
