import { useBookkeepingStart } from '../api/hooks';
import { fmtDateTime } from '../lib/format';

/** Historical consumption remains visible without inventing old asset balances. */
export function BookkeepingScopeNotice({ month, date, consumption = false }: { month?: string; date?: string; consumption?: boolean }) {
  const start = useBookkeepingStart().data;
  if (!start) return null;
  const historical = !!month && month < start.startDate.slice(0, 7);
  if (start.manualOpening) {
    if (start.consumptionHistory) {
      return (
        <div className="card muted" role="note" style={{ fontSize: 12 }}>
          {historical ? (
            <>该月的消费明细、消费定额、超额充值及超支仍正常统计，并计入完整消费累计。旧预算、储蓄和基金资产记录已删除，该月不提供资产对账。</>
          ) : (
            <>资产手工起账月份：{start.startDate.slice(0, 7)}。{consumption
              ? '消费明细、各月定额、超额充值及逐月超支持续按完整历史累计，不因资产起账截断；历史消费不会再次扣减当前银行余额。'
              : '手工期初合计包含当前银行余额、截至起账月累计消费定额、累计超额充值和基金总额；起账月预算只记一次累计定额支出。旧收入和旧资产流水不要重记；基金首次确认净投入为 0，之后只记确认后的买入和赎回。'}操作指引见「设置 → 重新起账」。</>
          )}
        </div>
      );
    }
    return (
      <div className="card muted" role="note" style={{ fontSize: 12 }}>
        {historical ? (
          <>该月仅保留历史消费查询；旧预算、储蓄和基金记录已删除，不参与新账额度或资产对账。当前是旧版起账口径，启用完整消费累计请到「设置 → 恢复历史消费资金」，不要全量导入覆盖新账。</>
        ) : (
          <>手工起账月份：{start.startDate.slice(0, 7)}。{consumption
            ? '起账月全部消费继续计入当月额度；更早月份消费仅供查询，不带入新账结转。'
            : '期初按当前资产手工重建，不代表月初余额。当前仍是旧版仅本月消费口径；需恢复完整消费累计，请先到设置中核对并恢复历史消费资金，再按累计指引检查期初。旧收入不要重记；基金首次确认净投入为 0，之后仅记确认后的买入和赎回。'}操作指引见「设置 → 重新起账」。</>
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
