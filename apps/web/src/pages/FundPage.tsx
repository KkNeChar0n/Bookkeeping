import { useEffect, useState } from 'react';
import { useBookkeepingStart, useFundSavings, useSetFundSavings } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';
import { BookkeepingScopeNotice } from '../components/BookkeepingScopeNotice';

export function FundPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const start = useBookkeepingStart().data;
  const historical = !!start && month < start.startDate.slice(0, 7);
  const fund = useFundSavings(month);
  const save = useSetFundSavings();
  const [marketValue, setMarketValue] = useState('0.00');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!fund.data || fund.data.month !== month) return;
    setMarketValue(fund.data.marketValueFilled ? fund.data.marketValue : '');
  }, [fund.data, month]);

  const submit = async () => {
    if (historical) return;
    setMessage('');
    try {
      await save.mutateAsync({ month, marketValue });
      setMessage(`${month} 基金市值已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const legacyCash = fund.data?.legacyPrepaidSnapshots ?? [];

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        基金只记录每月当前市值，不计算本金、投入或盈亏。待投资现金请作为普通储蓄卡余额管理。
      </div>

      <div className="card">
        <div className="field">
          <label>统计月份</label>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setMarketValue('');
              setMessage('');
            }}
          />
        </div>
        <BookkeepingScopeNotice month={month} />
        {!historical && <>
          <div className="field">
            <label>当前市值</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="未知"
              value={marketValue}
              onChange={(event) => setMarketValue(event.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              填该月核对时点的基金总市值；可以留空表示未知。基金买入、赎回及市值涨跌都不需要在基金页另记流水。
            </div>
          </div>
          <div className="sum-row total">
            <span>{marketValue.trim() ? '基金当前市值' : '基金当前市值（未知）'}</span>
            <b>{marketValue.trim() ? fmtMoney(Number(marketValue)) : '—'}</b>
          </div>
          <button
            className="primary mt"
            onClick={submit}
            disabled={save.isPending || fund.isPending || fund.isFetching || fund.data?.month !== month}
          >
            保存 {month}
          </button>
          {fund.data?.sourceMonth && fund.data.sourceMonth !== month && (
            <div className="muted mt" style={{ fontSize: 12 }}>
              当前市值沿用 {fund.data.sourceMonth} 的最后记录；保存后会生成 {month} 的记录。
            </div>
          )}
          {!fund.data?.filled && (
            <div className="muted mt" style={{ fontSize: 12 }}>
              此前没有基金记录，当前基金市值按 0 计算。
            </div>
          )}
          {fund.data?.filled && !fund.data.marketValueFilled && (
            <div className="warn mt">{month} 的基金市值尚未填写，总资产暂不完整。</div>
          )}
          {legacyCash.length > 0 && (
            <div className="warn mt" role="note">
              <div>旧版基金预充已停止参与统计。请新建一张普通储蓄卡（如“基金资金卡”），按实际情况迁移下列月底余额：</div>
              {legacyCash.map((row) => (
                <div key={row.month}>{row.month}：{fmtMoney(row.amount)}</div>
              ))}
              <div className="mt" style={{ fontSize: 12 }}>
                如果现有预算期初已经包含这些现金，新卡预算期初填 0，不能再增加全局期初合计。确认新卡余额后，再保存对应月份市值即可清理该月旧字段。
              </div>
            </div>
          )}
          {message && <div className="muted mt">{message}</div>}
        </>}
      </div>
    </div>
  );
}
