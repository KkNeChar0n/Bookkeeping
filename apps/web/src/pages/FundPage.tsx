import { useState } from 'react';
import { CardStack } from '../components/CardStack';
import { CreateCardForm } from '../components/CreateCardForm';

export function FundPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每张基金记两个数：累计投入(本金) 和 当前市值。盈亏自动算。
      </div>
      <CardStack type="FUND" basePath="/card" />

      <div className="spacer" />
      <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? '收起' : '＋ 新建基金'}</button>
      {showCreate && (
        <div className="mt">
          <CreateCardForm type="FUND" placeholder="如：沪深300定投" />
        </div>
      )}
    </div>
  );
}
