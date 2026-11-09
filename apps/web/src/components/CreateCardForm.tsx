import { useState } from 'react';
import { useCreateCard } from '../api/hooks';

/** Only user-managed cards can be created; consumption is a system account. */
export function CreateCardForm({
  type,
  placeholder,
}: {
  type: 'SAVINGS';
  placeholder: string;
}) {
  const create = useCreateCard();
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [isFundCash, setIsFundCash] = useState(false);
  const [msg, setMsg] = useState('');

  const add = async () => {
    setMsg('');
    try {
      await create.mutateAsync({
        name,
        type,
        initialBalance: isFundCash ? '0' : initial || '0',
        isFundCash,
      });
      setName('');
      setInitial('');
      setIsFundCash(false);
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={isFundCash}
            onChange={(e) => setIsFundCash(e.target.checked)}
            style={{ width: 'auto' }}
          />
          基金资金卡
        </label>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          只记录待投资现金的真实余额，不在预算中展示。
        </div>
      </div>
      <div className="field">
        <label>期初余额</label>
        <input
          type="number"
          step="0.01"
          value={isFundCash ? '0' : initial}
          onChange={(e) => setInitial(e.target.value)}
          placeholder="0.00"
          disabled={isFundCash}
        />
      </div>
      <button className="primary" onClick={add} disabled={!name.trim() || create.isPending}>
        添加
      </button>
      {msg && <div className="err mt">{msg}</div>}
    </div>
  );
}
