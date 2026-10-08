import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCardViews, useCards } from '../api/hooks';
import { CreateCardForm } from '../components/CreateCardForm';
import { fmtMoney, fmtSigned } from '../lib/format';

export function FundPage() {
  const cards = useCards();
  const views = useCardViews();
  const navigate = useNavigate();
  const funds = (cards.data ?? []).filter((card) => card.type === 'FUND');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (funds.length && !funds.find((card) => card.id === openId)) setOpenId(funds[0].id);
  }, [funds, openId]);

  const viewOf = (id: string) => views.data?.find((view) => view.cardId === id);

  return (
    <div>
      <h1 className="page-title">基金</h1>
      <div className="muted date-hint" style={{ textAlign: 'left', marginBottom: 12 }}>
        每张基金记两个数：累计投入（本金）和当前市值。盈亏自动计算。
      </div>

      {funds.length ? (
        <div className="stack">
          {funds.map((card) => {
            const view = viewOf(card.id);
            const open = openId === card.id;
            const profit = Number(view?.profit ?? 0);
            return (
              <div key={card.id} className="stack-item">
                <div className="stack-head" onClick={() => setOpenId(open ? null : card.id)}>
                  <div className="stack-name">
                    <span>{card.name}</span>
                    <span className="type-tag">基金</span>
                  </div>
                  <div className="stack-nums">
                    <span>{fmtMoney(view?.balance ?? '0')}</span>
                    <span className={profit >= 0 ? 'pos' : 'neg'}>
                      {fmtSigned(view?.profit ?? '0')}
                    </span>
                    <span className="muted">{open ? '▾' : '▸'}</span>
                  </div>
                </div>
                {open && view && (
                  <div className="card-detail">
                    <div className="kv">
                      <span>市值</span>
                      <b>{fmtMoney(view.balance)}</b>
                    </div>
                    <div className="kv">
                      <span>本金</span>
                      <span>{fmtMoney(view.principal)}</span>
                    </div>
                    <div className="kv">
                      <span>盈亏</span>
                      <b className={profit >= 0 ? 'pos' : 'neg'}>
                        {fmtSigned(view.profit)}
                        {view.profitPct !== null
                          ? `（${view.profitPct > 0 ? '+' : ''}${view.profitPct}%）`
                          : ''}
                      </b>
                    </div>
                    <button className="mini mt" onClick={() => navigate(`/card/${card.id}`)}>
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
      <button onClick={() => setShowCreate((current) => !current)}>
        {showCreate ? '收起' : '＋ 新建基金'}
      </button>
      {showCreate && (
        <div className="mt">
          <CreateCardForm type="FUND" placeholder="如：沪深300定投" />
        </div>
      )}
    </div>
  );
}
