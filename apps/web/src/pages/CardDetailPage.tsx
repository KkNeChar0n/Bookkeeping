import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCards,
  useDeleteCard,
  useFundPosition,
  useFundSnapshotHistory,
  useSetFundMonthEndValue,
  useUpdateCard,
} from '../api/hooks';
import { CARD_TYPE_LABEL } from '../api/types';
import { currentMonthStr, fmtDateTime, fmtMoney, fmtSigned } from '../lib/format';

export function CardDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cards = useCards();
  const update = useUpdateCard();
  const removeCard = useDeleteCard();
  const card = cards.data?.find((row) => row.id === id);
  const [month, setMonth] = useState(params.get('month') || currentMonthStr());

  if (!card)
    return (
      <div>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="muted mt">卡片不存在</div>
      </div>
    );
  if (card.type !== 'FUND')
    return (
      <div>
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="muted mt">该卡没有独立的基金详情页</div>
      </div>
    );

  const rename = () => {
    const value = window.prompt('新名称', card.name);
    if (value?.trim()) update.mutate({ id, name: value.trim() });
  };
  const remove = async () => {
    if (!window.confirm(`确定删除「${card.name}」及其全部月度市值和注资记录？此操作不可撤销。`))
      return;
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
      <FundDetail cardId={id} month={month} setMonth={setMonth} />
    </div>
  );
}

function FundDetail({
  cardId,
  month,
  setMonth,
}: {
  cardId: string;
  month: string;
  setMonth: (month: string) => void;
}) {
  const position = useFundPosition(cardId, month);
  const history = useFundSnapshotHistory(cardId);
  const setValue = useSetFundMonthEndValue();
  const [value, setValueInput] = useState('');
  const [message, setMessage] = useState('');
  const exact = history.data?.find((row) => row.month === month);

  useEffect(() => {
    setValueInput(exact?.value ?? '');
    setMessage('');
  }, [month, exact?.value]);

  const save = async () => {
    if (value.trim() === '') return;
    setMessage('');
    try {
      await setValue.mutateAsync({ fundCardId: cardId, month, value });
      setMessage(`${month} 月末市值已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };
  const current = position.data;
  const profit = Number(current?.profit ?? 0);

  return (
    <>
      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="swipe-balance">
          <span className="muted">月末市值</span>
          <div className="big">
            {current?.value === null || !current ? '未填' : fmtMoney(current.value)}
          </div>
          {current && (
            <div className={`muted ${current.profit === null ? '' : profit >= 0 ? 'pos' : 'neg'}`}>
              {current.profit === null ? '该月没有市值快照' : `盈亏 ${fmtSigned(current.profit)}`} ·
              本金 {fmtMoney(current.principal)}
            </div>
          )}
        </div>
      </div>

      <div className="section-title">记录 {month} 月末金额</div>
      <div className="card">
        <div className="field">
          <label>月末市值</label>
          <input
            type="number"
            step="0.01"
            placeholder="从基金 App 抄当前市值"
            value={value}
            onChange={(event) => setValueInput(event.target.value)}
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          本金由基金资金卡的注资记录自动计算，不能在这里修改。
        </div>
        <button className="primary" onClick={save} disabled={!value || setValue.isPending}>
          保存月末市值
        </button>
        {message && <div className="muted mt">{message}</div>}
      </div>

      <div className="section-title">月末市值记录</div>
      <div className="card">
        {history.data?.length ? (
          history.data.map((row) => (
            <div className="tx" key={row.month}>
              <div>
                <div>{row.month}</div>
                <div className="meta">{fmtDateTime(row.updatedAt)}</div>
              </div>
              <b>{fmtMoney(row.value)}</b>
            </div>
          ))
        ) : (
          <div className="muted">还没有月末市值记录</div>
        )}
      </div>
    </>
  );
}
