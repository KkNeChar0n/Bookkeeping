import { CardStack } from '../components/CardStack';

export function BudgetPage() {
  return (
    <div>
      <h1 className="page-title">预算</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        只有储蓄卡需要做预算。点开一张卡，按月添加预算细节。
      </div>
      <CardStack type="SAVINGS" basePath="/budget" />
    </div>
  );
}
