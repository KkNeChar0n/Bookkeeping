import type { Comparison } from '../api/types';
import { fmtMoney, fmtSigned } from '../lib/format';

export function ComparisonCards({ data }: { data: Comparison }) {
  return (
    <div>
      {data.unfilled && (
        <div className="warn">该期预算未填，下方对比基于最后一次预算（{data.basisDate ?? '无'}）。</div>
      )}
      {!data.unfilled && data.basisDate && (
        <div className="muted" style={{ marginBottom: 10 }}>
          对比基准：{data.basisDate} 的预算
        </div>
      )}
      <div className="balance-grid">
        {data.cards.map((c) => {
          const diffNum = Number(c.diff);
          return (
            <div key={c.cardId} className={`bcard${c.overspent ? ' over' : ''}`}>
              <div className="name">
                <span>{c.cardName}</span>
                {c.overspent && <span className="badge over">超支</span>}
              </div>
              <div className="actual">{fmtMoney(c.actualBalance)}</div>
              <div className="row">
                <span>预算 {fmtMoney(c.budgetBalance)}</span>
                <span className={`diff ${diffNum >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(c.diff)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
