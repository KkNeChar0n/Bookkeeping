import { useEffect, useState } from 'react';
import { useBookkeepingStart, useFundSavings, useSetFundSavings } from '../api/hooks';
import { currentMonthStr, fmtMoney } from '../lib/format';
import { BookkeepingScopeNotice } from '../components/BookkeepingScopeNotice';

export function FundPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const start = useBookkeepingStart().data;
  const startMonth = start?.startDate.slice(0, 7);
  const manualOpening = !!start?.manualOpening;
  const openingPending = manualOpening && !start?.fundOpeningConfirmed;
  const firstOpening = openingPending && month === startMonth;
  const historical = !!start && month < start.startDate.slice(0, 7);
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
    setNetInvestment(firstOpening ? '0' : fund.data.netInvestment ?? '');
    setFlowBaseline(!start && fund.data.isFlowBaseline);
  }, [fund.data, month, start, firstOpening]);

  const submit = async () => {
    if (historical || (openingPending && !firstOpening)) return;
    if (firstOpening && !window.confirm(
      `确认 ${month} 基金开账基准：市值 ${fmtMoney(Number(marketValue || 0))} 元，独立现金 ${fmtMoney(Number(prepaid || 0))} 元。\n\n这两个金额必须已包含在人工填写的预算期初中，系统不会再次叠加。首次净投入为 0，之前的买入和赎回不补记；后续净投入只记录本次确认后的交易。确定保存？`,
    )) return;
    setMessage('');
    try {
      await save.mutateAsync({
        month,
        marketValue,
        prepaid,
        netInvestment: firstOpening ? '0' : !start && flowBaseline ? undefined : netInvestment.trim() || undefined,
        flowBaseline: !start && flowBaseline,
      });
      setMessage(firstOpening
        ? `${month} 基金开账基准已确认；之后仅记录确认后的买入和赎回，不再补填以前的净投入。`
        : `${month} 基金数据已保存`);
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
        <BookkeepingScopeNotice month={month} />
        {!historical && <>
        {openingPending && <div className="warn mt" style={{ marginBottom: 12 }}>
          {firstOpening
            ? '首次确认基金开账：请填写与预算期初同一时点的当前市值和独立现金，确保已包含在手工期初中；首次净投入固定为 0。没有基金也请填写两个 0 并确认。'
            : `请先切回 ${startMonth}，确认已包含在手工期初中的基金市值和独立现金。基准未确认前不能保存其它月份，资产对账暂不完整。`}
        </div>}
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
            {firstOpening
              ? '开账必须填写当前市值，没有基金填 0。确认后作为固定基金基准，避免与人工期初重复计算。'
              : '可以暂时留空，表示该月市值未知。市值变化会等额进入对账两边，所以留空不改变差额，但总资产暂不完整。'}
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
          <label>{firstOpening ? '开账净投入（固定为 0）' : start && month === startMonth ? '基金开账确认后本月净投入' : '本月净投入'}</label>
          <input
            type="number"
            step="0.01"
            placeholder="未确认"
            value={netInvestment}
            onChange={(event) => setNetInvestment(event.target.value)}
            disabled={flowBaseline || firstOpening}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {firstOpening ? '此前买入已包含在当前资产中，不补记净投入。保存本次基准后才累计新买入和赎回。' : <>
              {manualOpening && month === startMonth ? '仅计算首次开账确认之后的交易。' : ''}
              实际买入基金填正数，赎回填负数；银行卡转入预充卡不算净投入。填 0
              表示已确认买入与赎回的现金净额为 0，留空表示未知。
            </>}
          </div>
        </div>
        {!start && <div className="field">
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
        </div>}
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
            (firstOpening && marketValue.trim() === '') ||
            (openingPending && !firstOpening) ||
            save.isPending ||
            fund.isPending ||
            fund.isFetching ||
            fund.data?.month !== month
          }
        >
          {firstOpening ? `确认 ${month} 基金开账基准` : `保存 ${month}`}
        </button>
        {fund.data?.sourceMonth && fund.data.sourceMonth !== month && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            当前市值和预充金额沿用 {fund.data.sourceMonth}{' '}
            的最后记录；本月净投入不会沿用。保存后会生成 {month} 的记录。
          </div>
        )}
        {!fund.data?.filled && !openingPending && (
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
        </>}
      </div>
    </div>
  );
}
