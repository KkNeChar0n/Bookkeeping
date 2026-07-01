import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCardViews, useCards } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { fmtMoney, fmtSigned } from '../lib/format';

export function FundPage() {
  const cards = useCards();
  const views = useCardViews();
  const navigate = useNavigate();
  const funds = (cards.data ?? []).filter((c) => c.type === 'FUND');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (funds.length && !funds.find((c) => c.id === openId)) setOpenId(funds[0].id);
  }, [funds, openId]);

  const viewOf = (id: string) => views.data?.find((v) => v.cardId === id);

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每张基金记两个数：累计投入(本金) 和 当前市值。盈亏自动算。
      </div>

      {funds.length ? (
        <div className="stack">
          {funds.map((c) => {
            const v = viewOf(c.id);
            const open = openId === c.id;
            const profit = v ? Number(v.profit) : 0;
            return (
              <div key={c.id} className="stack-item">
                <div className="stack-head" onClick={() => setOpenId(open ? null : c.id)}>
                  <div className="stack-name">
                    <span>{c.name}</span>
                    <span className="type-tag">基金</span>
                  </div>
                  <div className="stack-nums">
                    <span>{fmtMoney(v?.balance ?? '0')}</span>
                    <span className={profit >= 0 ? 'pos' : 'neg'}>{fmtSigned(v?.profit ?? '0')}</span>
                    <span className="muted">{open ? '▾' : '▸'}</span>
                  </div>
                </div>
                {open && v && (
                  <div className="card-detail">
                    <div className="kv">
                      <span>市值</span>
                      <b>{fmtMoney(v.balance)}</b>
                    </div>
                    <div className="kv">
                      <span>本金</span>
                      <span>{fmtMoney(v.principal)}</span>
                    </div>
                    <div className="kv">
                      <span>盈亏</span>
                      <b className={profit >= 0 ? 'pos' : 'neg'}>
                        {fmtSigned(v.profit)}
                        {v.profitPct !== null ? `（${v.profitPct > 0 ? '+' : ''}${v.profitPct}%）` : ''}
                      </b>
                    </div>
                    <button className="mini mt" onClick={() => navigate(`/card/${c.id}`)}>
                      更新本金 / 市值
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card muted">还没有基金。</div>
      )}

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
