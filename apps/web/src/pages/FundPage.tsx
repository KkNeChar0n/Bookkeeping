import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCards, useFundPositionsAsOf } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { currentMonthStr, fmtMoney, fmtSigned } from '../lib/format';

export function FundPage() {
  const cards = useCards();
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthStr());
  const positions = useFundPositionsAsOf(month);
  const [showCreate, setShowCreate] = useState(false);
  const funds = positions.data ?? [];

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        本金由基金资金卡的注资累计生成；这里只按月记录月末市值。
      </div>
      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>查看月份</label>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
      </div>

      {funds.length ? (
        <div className="stack mt">
          {funds.map((fund) => {
            const profit = Number(fund.profit ?? 0);
            return (
              <div
                key={fund.fundCardId}
                className="stack-item open"
                onClick={() => navigate(`/card/${fund.fundCardId}?month=${month}`)}
              >
                <div className="stack-head">
                  <div className="stack-name">
                    <span>{fund.fundName}</span>
                    <span className="type-tag">基金</span>
                  </div>
                  <span className="muted">编辑 ›</span>
                </div>
                <div className="card-detail">
                  <div className="kv">
                    <span>月末市值</span>
                    <b>{fund.value === null ? '未填' : fmtMoney(fund.value)}</b>
                  </div>
                  <div className="kv">
                    <span>截至本月本金</span>
                    <span>{fmtMoney(fund.principal)}</span>
                  </div>
                  <div className="kv">
                    <span>盈亏</span>
                    {fund.profit === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <b className={profit >= 0 ? 'pos' : 'neg'}>
                        {fmtSigned(fund.profit)}
                        {fund.profitPct !== null
                          ? `（${fund.profitPct > 0 ? '+' : ''}${fund.profitPct}%）`
                          : ''}
                      </b>
                    )}
                  </div>
                  {fund.valueMonth && fund.valueMonth !== month && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      市值沿用 {fund.valueMonth} 的最近快照
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card muted mt">还没有基金。</div>
      )}

      <div className="spacer" />
      <button onClick={() => setShowCreate((current) => !current)}>
        {showCreate ? '收起' : '＋ 新建基金'}
      </button>
      {showCreate && (
        <div className="mt">
          <CreateCardForm type="FUND" placeholder="如：沪深300定投" />
        </div>
      )}
      {(cards.data ?? []).every((card) => card.savingsPurpose !== 'FUND_POOL') && (
        <div className="warn mt">还没有基金资金卡，可在“记账 → 设置”中创建。</div>
      )}
    </div>
  );
}
