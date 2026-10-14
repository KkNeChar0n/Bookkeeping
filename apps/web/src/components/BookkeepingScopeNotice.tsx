import { useBookkeepingStart } from '../api/hooks';
import { fmtDateTime } from '../lib/format';

/** Historical consumption remains visible without inventing old asset balances. */
export function BookkeepingScopeNotice({ month, date, consumption = false }: { month?: string; date?: string; consumption?: boolean }) {
  const start = useBookkeepingStart().data;
  if (!start) return null;
  const historical = !!month && month < start.startDate.slice(0, 7);
  if (start.manualOpening) {
    return (
      <div className="card muted" role="note" style={{ fontSize: 12 }}>
        {historical ? (
          <>该月仅保留历史消费查询；旧预算、储蓄和基金记录已删除，不参与新账额度或资产对账。恢复旧账须导入清账前下载的备份，会覆盖新账。</>
        ) : (
          <>手工起账月份：{start.startDate.slice(0, 7)}。{consumption
            ? '起账月全部消费继续计入当月额度；更早月份消费仅供查询，不带入新账结转。'
            : '期初按当前资产手工重建，不代表月初余额。期初合计已含起账月定额、超额充值和基金总额；定额在预算记一次支出，储蓄填完整定额贡献与充值。旧收入不要重记；基金首次确认净投入为 0，之后仅记确认后的买入和赎回。'}操作指引见「设置 → 重新起账」。</>
        )}
      </div>
    );
  }
  return (
    <div className="card muted" role="note" style={{ fontSize: 12 }}>
      {historical ? (
        <>该月属于历史账本：消费仍可查询；旧资产记录不参与新账对账或超支。恢复旧账须导入此前保存的备份，会覆盖新账。</>
      ) : (
        <>新账起点：{fmtDateTime(start.createdAt)}。{consumption
          ? `${date && date < start.startDate ? '所选日期早于起账日，补录只供历史查询。' : ''}历史消费保留查询，额度、已花和超支只计算起点后的新账消费。补录起账日前的消费不影响新账。`
          : '当月收入、充值、预算收支和基金净投入只填起点之后的金额；起点之前的资金变化已包含在期初资产中，不要重复填写。消费预算只填起点后适用的剩余额度，不要将以前的支出再扣一次余额。'}</>
      )}
    </div>
  );
}
