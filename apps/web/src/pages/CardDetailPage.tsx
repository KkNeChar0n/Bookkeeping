import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssetTransfers,
  useCardViews,
  useCards,
  useDeleteCard,
  useFundPrincipalLogs,
  useRemoveAssetTransfer,
  useSetFund,
  useUpdateCard,
} from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
import { fmtDateTime, fmtMoney, fmtSigned } from '../lib/format';

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
  const transfers = useAssetTransfers({ fundCardId: cardId });
  const principalLogs = useFundPrincipalLogs(cardId);
  const removeTransfer = useRemoveAssetTransfer();
  const [message, setMessage] = useState('');
  const view = views.data?.find((row) => row.cardId === cardId);
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setPrincipal(initialPrincipal);
    setValue(initialValue);
  }, [initialPrincipal, initialValue]);

  const saveValue = async () => {
    setMessage('');
    if (value === '') return;
    try {
      await setFund.mutateAsync({ id: cardId, value });
      setMessage('市值已更新');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新失败');
    }
  };
  const savePrincipal = async () => {
    setMessage('');
    if (principal === '') return;
    if (!window.confirm('这是本金校准，会留下审计记录。确认保存？')) return;
    try {
      await setFund.mutateAsync({ id: cardId, principal });
      setMessage('本金校准已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '校准失败');
    }
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
      <div className="section-title">更新市值</div>
      <div className="card">
        <div className="field">
          <label>当前市值（从基金 App 抄录）</label>
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <button className="primary" onClick={saveValue} disabled={!value || setFund.isPending}>
          保存市值
        </button>
        {message && <div className="muted mt">{message}</div>}
      </div>

      <div className="section-title">本金校准</div>
      <div className="card">
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          日常投入请从储蓄卡使用“资产划转”。这里只用于修正历史或录入错误，每次修改都会留痕。
        </div>
        <div className="field">
          <label>累计投入 · 本金</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
          />
        </div>
        <button onClick={savePrincipal} disabled={!principal || setFund.isPending}>
          校准本金
        </button>
      </div>

      <div className="section-title">资产划转记录</div>
      <div className="card">
        {(transfers.data ?? []).length ? (
          (transfers.data ?? []).map((row) => (
            <div className="tx" key={row.id}>
              <div>
                <div>
                  {row.sourceCardName} → 本基金
                  {!row.principalApplied ? ' · 本金已包含' : ''}
                </div>
                <div className="meta">
                  {row.date}
                  {row.note ? ` · ${row.note}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="amt in">+{fmtMoney(row.amount)}</div>
                <button
                  className="mini danger"
                  onClick={async () => {
                    if (!window.confirm('撤销这笔资产划转？')) return;
                    await removeTransfer.mutateAsync(row.id);
                  }}
                >
                  撤销
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">还没有转入记录</div>
        )}
      </div>

      <div className="section-title">本金校准记录</div>
      <div className="card">
        {(principalLogs.data ?? []).length ? (
          (principalLogs.data ?? []).map((log) => (
            <div className="tx" key={log.id}>
              <div>
                <div>本金校准</div>
                <div className="meta">{fmtDateTime(log.createdAt)}</div>
              </div>
              <span>
                {fmtMoney(log.previousAmount)} → <b>{fmtMoney(log.amount)}</b>
              </span>
            </div>
          ))
        ) : (
          <div className="muted">还没有本金校准</div>
        )}
      </div>
    </>
  );
}
