import { useState } from 'react';
import { useSummary } from '../api/hooks';
import { ComparisonCards } from '../components/ComparisonCards';
import { fmtMoney, currentMonthStr } from '../lib/format';

function pctText(p: number | null): string {
  if (p === null) return '—';
  return `${p > 0 ? '+' : ''}${p}%`;
}

export function SummaryPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const summary = useSummary(month);
  const s = summary.data;

  return (
    <div>
      <h1 className="page-title">总结</h1>

      <div className="field">
        <label>月份</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {s && (
        <>
          <div className="section-title">本月真实收支（不含调账/调整）</div>
          <div className="stat">
            <div className="box">
              <div className="k">收入</div>
              <div className="v" style={{ color: 'var(--green)' }}>
                {fmtMoney(s.current.income)}
              </div>
            </div>
            <div className="box">
              <div className="k">支出</div>
              <div className="v" style={{ color: 'var(--red)' }}>
                {fmtMoney(s.current.expense)}
              </div>
            </div>
          </div>

          <div className="section-title">环比 / 同比</div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>对比</th>
                  <th>收入</th>
                  <th>支出</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>上月（{s.m2m.previous.label}）</td>
                  <td>{fmtMoney(s.m2m.previous.income)}</td>
                  <td>{fmtMoney(s.m2m.previous.expense)}</td>
                </tr>
                <tr>
                  <td>月环比</td>
                  <td>{pctText(s.m2m.incomePct)}</td>
                  <td>{pctText(s.m2m.expensePct)}</td>
                </tr>
                <tr>
                  <td>去年同月（{s.y2y.sameMonthLastYear.label}）</td>
                  <td>{fmtMoney(s.y2y.sameMonthLastYear.income)}</td>
                  <td>{fmtMoney(s.y2y.sameMonthLastYear.expense)}</td>
                </tr>
                <tr>
                  <td>年同比</td>
                  <td>{pctText(s.y2y.incomePct)}</td>
                  <td>{pctText(s.y2y.expensePct)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="section-title">预算 vs 实际</div>
          <ComparisonCards data={s.budgetVsActual} />
        </>
      )}
    </div>
  );
}
