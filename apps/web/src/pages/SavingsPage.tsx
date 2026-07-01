import { SavingsStack } from '../components/SavingsStack';

export function SavingsPage() {
  return (
    <div>
      <h1 className="page-title">储蓄</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每月 1 号给每张储蓄卡填一个真实储蓄金额。
      </div>
      <SavingsStack basePath="/savings" />
    </div>
  );
}
