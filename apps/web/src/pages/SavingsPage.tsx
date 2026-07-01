import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCards, useSavingsList } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { BackupPanel } from '../components/BackupPanel';
import { fmtMoney, fmtSigned } from '../lib/format';
import type { Card } from '../api/types';

export function SavingsPage() {
  const cards = useCards();
  const savings = (cards.data ?? []).filter((c) => c.type === 'SAVINGS');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (savings.length && !savings.find((c) => c.id === openId)) setOpenId(savings[0].id);
  }, [savings, openId]);

  return (
    <div>
      <h1 className="page-title">储蓄</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每月 1 号给每张储蓄卡填一个真实储蓄金额。
      </div>

      {savings.length ? (
        <div className="stack">
          {savings.map((c) => (
            <SavingsRow
              key={c.id}
              card={c}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card muted">还没有储蓄卡。</div>
      )}

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

function SavingsRow({ card, open, onToggle }: { card: Card; open: boolean; onToggle: () => void }) {
  const list = useSavingsList(card.id); // 按月倒序
  const navigate = useNavigate();
  const rows = list.data ?? [];
  const current = rows[0]?.amount;

  return (
    <div className={`stack-item${open ? ' open' : ''}`}>
      <div className="stack-head" onClick={onToggle}>
        <div className="stack-name">
          <span>{card.name}</span>
          <span className="type-tag">储蓄卡</span>
        </div>
        <div className="stack-nums">
          <span>{current !== undefined ? fmtMoney(current) : '未填'}</span>
          <span className="muted">{open ? '▾' : '▸'}</span>
        </div>
      </div>

      {open && (
        <div className="card-detail">
          {rows.length ? (
            rows.map((r, i) => {
              const prev = rows[i + 1]; // 更早一个月
              const delta = prev ? Number(r.amount) - Number(prev.amount) : null;
              return (
                <div className="kv" key={r.id}>
                  <span>{r.month}</span>
                  <span>
                    <b>{fmtMoney(r.amount)}</b>
                    {delta !== null && (
                      <span className={`ml ${delta >= 0 ? 'pos' : 'neg'}`}> 环比 {fmtSigned(delta)}</span>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="muted">还没有记录</div>
          )}
          <button className="mini mt" onClick={() => navigate(`/savings/${card.id}`)}>
            填写 / 编辑
          </button>
        </div>
      )}
    </div>
  );
}
