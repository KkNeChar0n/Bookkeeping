import { useEffect, useState } from 'react';
import { useFundSavings, useSetFundSavings } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';

export function FundPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const fund = useFundSavings(month);
  const save = useSetFundSavings();
  const [marketValue, setMarketValue] = useState('0.00');
  const [prepaid, setPrepaid] = useState('0.00');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!fund.data || fund.data.month !== month) return;
    setMarketValue(fund.data.marketValue);
    setPrepaid(fund.data.prepaid);
  }, [fund.data, month]);

  const submit = async () => {
    setMessage('');
    try {
      await save.mutateAsync({ month, marketValue, prepaid });
      setMessage(`${month} 基金储蓄已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const total = Number(marketValue || 0) + Number(prepaid || 0);

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        这里只记录基金的总市值和预充金额，两项都属于储蓄池，不计算本金或盈亏，也不会影响统计差额。
      </div>

      <div className="card">
        <div className="field">
          <label>统计月份</label>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setMessage('');
            }}
          />
        </div>
        <div className="field">
          <label>当前市值</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={marketValue}
            onChange={(event) => setMarketValue(event.target.value)}
          />
        </div>
        <div className="field">
          <label>预充金额</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={prepaid}
            onChange={(event) => setPrepaid(event.target.value)}
          />
        </div>
        <div className="sum-row total">
          <span>基金储蓄池合计</span>
          <b>{fmtMoney(total)}</b>
        </div>
        <button
          className="primary mt"
          onClick={submit}
          disabled={marketValue === '' || prepaid === '' || save.isPending}
        >
          保存 {month}
        </button>
        {fund.data?.sourceMonth && fund.data.sourceMonth !== month && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            当前显示沿用 {fund.data.sourceMonth} 的最后记录，保存后会生成 {month} 的记录。
          </div>
        )}
        {!fund.data?.filled && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            此前没有基金记录，当前按 0 计算。
          </div>
        )}
        {message && <div className="muted mt">{message}</div>}
      </div>
    </div>
  );
}
