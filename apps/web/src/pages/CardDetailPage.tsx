import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCardViews, useCards, useDeleteCard, useSetFund, useUpdateCard } from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
import { fmtMoney, fmtSigned } from '../lib/format';

/** User-managed card detail is fund-only; consumption has its own workspace. */
export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const update = useUpdateCard();
  const removeCard = useDeleteCard();
  const card = cards.data?.find((row) => row.id === id);

  if (!card) {
    return (
      <div>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="muted mt">卡片不存在</div>
      </div>
    );
  }
  if (card.type !== 'FUND') {
    return (
      <div>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="muted mt">该卡没有独立的基金详情页</div>
      </div>
    );
  }

  const rename = () => {
    const value = window.prompt('新名称', card.name);
    if (value?.trim()) update.mutate({ id, name: value.trim() });
  };
  const remove = async () => {
    if (!window.confirm(`确定删除「${card.name}」及其全部关联数据？此操作不可撤销。`)) return;
    await removeCard.mutateAsync(id);
    navigate('/fund');
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate('/fund')}>
          ‹ 返回
        </button>
        <div className="detail-title">
          <strong>{card.name}</strong>
          <span className="type-tag">{CARD_TYPE_LABEL[card.type]}</span>
        </div>
        <div className="detail-actions">
          <button className="mini" onClick={rename}>
            改名
          </button>
          <button className="mini danger" onClick={remove}>
            删除
          </button>
        </div>
      </div>
      <FundDetail
        cardId={id}
        initialPrincipal={card.fundPrincipal ?? '0'}
        initialValue={card.fundValue ?? '0'}
      />
    </div>
  );
}

function FundDetail({
  cardId,
  initialPrincipal,
  initialValue,
}: {
  cardId: string;
  initialPrincipal: string;
  initialValue: string;
}) {
  const views = useCardViews();
  const setFund = useSetFund();
  const [message, setMessage] = useState('');
  const view = views.data?.find((row) => row.cardId === cardId);
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setPrincipal(initialPrincipal);
    setValue(initialValue);
  }, [initialPrincipal, initialValue]);

  const save = async () => {
    setMessage('');
    const body: { id: string; principal?: string; value?: string } = { id: cardId };
    if (principal !== '') body.principal = principal;
    if (value !== '') body.value = value;
    if (!body.principal && !body.value) return;
    await setFund.mutateAsync(body);
    setMessage('已更新');
  };
  const profit = Number(view?.profit ?? 0);

  return (
    <>
      <div className="card">
        <div className="swipe-balance">
          <span className="muted">市值</span>
          <div className="big">{fmtMoney(view?.balance ?? '0')}</div>
          {view && (
            <div className={`muted ${profit >= 0 ? 'pos' : 'neg'}`}>
              盈亏 {fmtSigned(view.profit)}
              {view.profitPct !== null
                ? `（${view.profitPct > 0 ? '+' : ''}${view.profitPct}%）`
                : ''}{' '}
              · 本金 {fmtMoney(view.principal)}
            </div>
          )}
        </div>
      </div>
      <div className="section-title">更新（从基金 App 抄这两个数）</div>
      <div className="card">
        <div className="field">
          <label>累计投入 · 本金</label>
          <input
            type="number"
            step="0.01"
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
          />
        </div>
        <div className="field">
          <label>当前市值</label>
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <button className="primary" onClick={save} disabled={!principal && !value}>
          保存
        </button>
        {message && <div className="muted mt">{message}</div>}
      </div>
    </>
  );
}
