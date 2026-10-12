import { useEffect, useState } from 'react';
import { useFundSavings, useSetFundSavings } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';

export function FundPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const fund = useFundSavings(month);
  const save = useSetFundSavings();
  const [marketValue, setMarketValue] = useState('0.00');
  const [prepaid, setPrepaid] = useState('0.00');
  const [netInvestment, setNetInvestment] = useState('');
  const [flowBaseline, setFlowBaseline] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!fund.data || fund.data.month !== month) return;
    setMarketValue(fund.data.marketValueFilled ? fund.data.marketValue : '');
    setPrepaid(fund.data.prepaid);
    // 净投入是单月流量，只能读取目标月的精确值，禁止像余额一样沿用上月。
    setNetInvestment(fund.data.netInvestment ?? '');
    setFlowBaseline(fund.data.isFlowBaseline);
  }, [fund.data, month]);

  const submit = async () => {
    setMessage('');
    try {
      await save.mutateAsync({
        month,
        marketValue,
        prepaid,
        netInvestment: flowBaseline ? undefined : netInvestment.trim() || undefined,
        flowBaseline,
      });
      setMessage(`${month} 基金数据已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const total = Number(marketValue || 0) + Number(prepaid || 0);

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        当前市值是已投入基金的资产；预充金额是未记入其他储蓄卡余额、尚未买入基金的独立现金。不计算本金或盈亏。
      </div>

      <div className="card">
        <div className="field">
          <label>统计月份</label>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              // 先清空上一月表单，避免新查询返回前误将其保存到新月。
              setMarketValue('');
              setPrepaid('');
              setNetInvestment('');
              setFlowBaseline(false);
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
            placeholder="未知"
            value={marketValue}
            onChange={(event) => setMarketValue(event.target.value)}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            可以暂时留空，表示该月市值未知。市值会等额进入对账两边，所以留空不改变差额，但总资产暂不完整。
          </div>
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
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            这是基金资金卡中的现金；如果某笔钱已在其他储蓄卡余额中，请勿重复填写。
          </div>
        </div>
        <div className="field">
          <label>本月净投入</label>
          <input
            type="number"
            step="0.01"
            placeholder="未确认"
            value={netInvestment}
            onChange={(event) => setNetInvestment(event.target.value)}
            disabled={flowBaseline}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            实际买入基金填正数，赎回填负数；银行卡转入预充卡不算净投入。填 0
            表示已确认本月买入与赎回的现金净额为 0，留空表示未知。
          </div>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={flowBaseline}
              onChange={(event) => {
                setFlowBaseline(event.target.checked);
                if (event.target.checked) setNetInvestment('');
              }}
              style={{ width: 'auto' }}
            />
            历史对账起点（从下月开始记录净投入）
          </label>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            只在该月历史资产已经核对正确、但更早的基金买入记录无法还原时使用。它不会把现有差额强制归零。
          </div>
        </div>
        <div className="sum-row total">
          <span>{marketValue.trim() ? '基金资产合计' : '已填资产合计（市值未知）'}</span>
          <b>{fmtMoney(total)}</b>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          本月净投入是对账调整项，不是额外资产，不计入上方合计。
        </div>
        <button
          className="primary mt"
          onClick={submit}
          disabled={
            prepaid === '' ||
            save.isPending ||
            fund.isPending ||
            fund.isFetching ||
            fund.data?.month !== month
          }
        >
          保存 {month}
        </button>
        {fund.data?.sourceMonth && fund.data.sourceMonth !== month && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            当前市值和预充金额沿用 {fund.data.sourceMonth}{' '}
            的最后记录；本月净投入不会沿用。保存后会生成 {month} 的记录。
          </div>
        )}
        {!fund.data?.filled && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            此前没有基金记录，当前基金市值和预充均按 0 计算。
          </div>
        )}
        {fund.data?.flowBaselineMonth && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            基金净投入的历史对账起点为 {fund.data.flowBaselineMonth}；只累计此后月份的买入和赎回。
          </div>
        )}
        {fund.data?.filled && !fund.data.marketValueFilled && (
          <div className="warn mt">
            {month} 的基金市值尚未填写，总资产暂不完整，但对账差额不受影响。
          </div>
        )}
        {fund.data?.filled &&
          !fund.data.isFlowBaseline &&
          fund.data.missingNetInvestmentMonths.length > 0 && (
            <div className="warn mt">
              基金净投入尚未确认的月份：{fund.data.missingNetInvestmentMonths.join('、')}。
              对账中的预算基准和“利息/其他”暂不完整。
            </div>
          )}
        {message && <div className="muted mt">{message}</div>}
      </div>
    </div>
  );
}
