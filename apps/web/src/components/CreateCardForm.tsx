import { useState } from 'react';
import { useCreateCard } from '../api/hooks';
import type { CardType, SavingsPurpose } from '../api/types';

/** Only user-managed cards can be created; consumption is a system account. */
export function CreateCardForm({
  type,
  placeholder,
  savingsPurpose,
}: {
  type: Exclude<CardType, 'SPEND'>;
  placeholder: string;
  savingsPurpose?: SavingsPurpose;
}) {
  const create = useCreateCard();
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [msg, setMsg] = useState('');

  const add = async () => {
    setMsg('');
    try {
      await create.mutateAsync({
        name,
        type,
        initialBalance: initial || '0',
        savingsPurpose,
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
      <div className="field">
        <label>{type === 'FUND' ? '初始市值/本金' : '期初余额'}</label>
        <input
          type="number"
          step="0.01"
          value={initial}
          onChange={(e) => setInitial(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <button className="primary" onClick={add} disabled={!name.trim() || create.isPending}>
        添加
      </button>
      {msg && <div className="err mt">{msg}</div>}
    </div>
  );
}
