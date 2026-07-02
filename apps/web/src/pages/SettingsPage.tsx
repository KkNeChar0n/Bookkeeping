import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAddCategory, useCategoryList, useRemoveCategory, useRenameCategory } from '../api/hooks';
import { BackupPanel } from '../components/BackupPanel';
import { CreateCardForm } from '../components/CreateCardForm';

export function SettingsPage() {
  const navigate = useNavigate();
  const list = useCategoryList();
  const rows = list.data ?? [];
  const income = rows.filter((r) => r.kind === 'income');
  const expense = rows.filter((r) => r.kind === 'expense');

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate(-1)}>
          ‹ 返回
        </button>
        <div className="detail-title">
          <strong>设置 · 收支类型</strong>
        </div>
        <span style={{ width: 40 }} />
      </div>

      <div className="section-title">新建储蓄卡</div>
      <CreateCardForm type="SAVINGS" placeholder="如：工资卡" />

      <div className="section-title">新建消费卡</div>
      <CreateCardForm type="SPEND" placeholder="如：日常消费" />

      <KindSection kind="income" title="收入类型" rows={income} />
      <KindSection kind="expense" title="支出类型" rows={expense} />

      <BackupPanel />
    </div>
  );
}

function KindSection({
  kind,
  title,
  rows,
}: {
  kind: 'income' | 'expense';
  title: string;
  rows: { id: string; name: string }[];
}) {
  const add = useAddCategory();
  const rename = useRenameCategory();
  const remove = useRemoveCategory();
  const [name, setName] = useState('');

  const doAdd = async () => {
    if (!name.trim()) return;
    await add.mutateAsync({ kind, name });
    setName('');
  };
  const doRename = (id: string, cur: string) => {
    const v = window.prompt('新名称', cur);
    if (v && v.trim()) rename.mutate({ id, name: v.trim() });
  };

  return (
    <>
      <div className="section-title">{title}</div>
      <div className="card">
        {rows.length ? (
          rows.map((r) => (
            <div className="tx" key={r.id}>
              <div>{r.name}</div>
              <div className="row-between">
                <button className="mini" onClick={() => doRename(r.id, r.name)}>
                  改名
                </button>
                <button className="mini danger" onClick={() => remove.mutate(r.id)}>
                  删除
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">还没有类型</div>
        )}
        <div className="row-between mt" style={{ gap: 8 }}>
          <input placeholder="新增类型名称" value={name} onChange={(e) => setName(e.target.value)} />
          <button style={{ width: 'auto', padding: '11px 16px', whiteSpace: 'nowrap' }} onClick={doAdd} disabled={!name.trim()}>
            添加
          </button>
        </div>
      </div>
    </>
  );
}
