import { useState } from 'react';
import { useCreateCard } from '../api/hooks';
import type { CardType } from '../api/types';

/** 在各自页面创建对应类型的卡。消费卡不需要初始余额。 */
export function CreateCardForm({ type, placeholder }: { type: CardType; placeholder: string }) {
  const create = useCreateCard();
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [msg, setMsg] = useState('');
  const needBalance = type !== 'SPEND';

  const add = async () => {
    setMsg('');
    try {
      await create.mutateAsync({
        name,
        type,
        ...(needBalance ? { initialBalance: initial || '0' } : {}),
      });
      setName('');
      setInitial('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '添加失败');
    }
  };

  return (
    <div className="card">
      <div className="field">
        <label>名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      </div>
      {needBalance && (
        <div className="field">
          <label>{type === 'FUND' ? '初始市值/本金' : '初始余额'}</label>
          <input
            type="number"
            step="0.01"
            value={initial}
            onChange={(e) => setInitial(e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}
      <button className="primary" onClick={add} disabled={!name.trim() || create.isPending}>
        添加
      </button>
      {msg && <div className="err mt">{msg}</div>}
    </div>
  );
}
