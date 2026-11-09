import { useState } from 'react';
import { useDeleteCard, useUpdateCard } from '../api/hooks';

/** 卡片管理（改名/改初始/删除），放在各卡详情页底部 */
export function CardManageBar({
  cardId,
  name,
  initialBalance,
  showInitial,
  isFundCash = false,
  onDeleted,
}: {
  cardId: string;
  name: string;
  initialBalance?: string;
  showInitial?: boolean;
  isFundCash?: boolean;
  onDeleted: () => void;
}) {
  const update = useUpdateCard();
  const del = useDeleteCard();
  const [msg, setMsg] = useState('');

  const rename = () => {
    const v = window.prompt('新名称', name);
    if (v && v.trim()) update.mutate({ id: cardId, name: v.trim() });
  };
  const editInitial = () => {
    const v = window.prompt('初始余额', initialBalance ?? '0');
    if (v !== null) update.mutate({ id: cardId, initialBalance: v });
  };
  const toggleFundCash = async () => {
    setMsg('');
    try {
      await update.mutateAsync({ id: cardId, isFundCash: !isFundCash });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '修改失败');
    }
  };
  const remove = async () => {
    if (!window.confirm(`确定删除「${name}」及其全部收支、预算和修改记录？此操作不可撤销。`))
      return;
    try {
      await del.mutateAsync(cardId);
      onDeleted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="mt">
      <div className="card-row-actions">
        <button className="mini" onClick={rename}>
          改名
        </button>
        {showInitial && !isFundCash && (
          <button className="mini" onClick={editInitial}>
            改初始
          </button>
        )}
        <button className="mini" onClick={toggleFundCash} disabled={update.isPending}>
          {isFundCash ? '取消基金资金卡' : '设为基金资金卡'}
        </button>
        <button className="mini danger" onClick={remove}>
          删除此卡
        </button>
      </div>
      {msg && <div className="err mt">{msg}</div>}
    </div>
  );
}
