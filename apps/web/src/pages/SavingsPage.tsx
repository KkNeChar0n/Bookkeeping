import { useState } from 'react';
import { SavingsStack } from '../components/SavingsStack';
import { CreateCardForm } from '../components/CreateCardForm';
import { BackupPanel } from '../components/BackupPanel';

export function SavingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div>
      <h1 className="page-title">储蓄</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每月 1 号给每张储蓄卡填一个真实储蓄金额。
      </div>
      <SavingsStack basePath="/savings" />

      <div className="spacer" />
      <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? '收起' : '＋ 新建储蓄卡'}</button>
      {showCreate && (
        <div className="mt">
          <CreateCardForm type="SAVINGS" placeholder="如：工资卡" />
        </div>
      )}

      <div className="spacer" />
      <BackupPanel />
    </div>
  );
}
