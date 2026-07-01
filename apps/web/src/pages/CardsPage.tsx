import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCards,
  useCreateCard,
  useDeleteCard,
  useReorderCards,
  useSetDefaultCard,
  useUpdateCard,
} from '../api/hooks';
import { backupService } from '../services/backup.service';
import { fmtMoney } from '../lib/format';

export function CardsPage() {
  const cards = useCards();
  const create = useCreateCard();
  const update = useUpdateCard();
  const del = useDeleteCard();
  const setDefault = useSetDefaultCard();
  const reorder = useReorderCards();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState('');

  const doExport = async () => {
    setBackupMsg('');
    try {
      await backupService.downloadBackup();
      setBackupMsg('已导出备份文件');
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : '导出失败');
    }
  };

  const doImport = async (file: File) => {
    if (!window.confirm('导入会覆盖当前全部数据，确定继续？')) return;
    setBackupMsg('');
    try {
      const r = await backupService.importFromFile(file);
      qc.invalidateQueries();
      setBackupMsg(`导入成功：卡 ${r.cards}、预算 ${r.snapshots}、流水 ${r.transactions}`);
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : '导入失败');
    }
  };

  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [msg, setMsg] = useState('');

  const list = cards.data ?? [];

  const add = async () => {
    setMsg('');
    try {
      await create.mutateAsync({ name, initialBalance: initial || '0' });
      setName('');
      setInitial('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '添加失败');
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...list];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    reorder.mutate(next.map((c) => c.id));
  };

  const rename = (id: string, current: string) => {
    const v = window.prompt('新名称', current);
    if (v && v.trim()) update.mutate({ id, name: v.trim() });
  };

  const editInitial = (id: string, current: string) => {
    const v = window.prompt('初始余额', current);
    if (v !== null) update.mutate({ id, initialBalance: v });
  };

  const remove = async (id: string) => {
    if (!window.confirm('确定删除这张卡？')) return;
    setMsg('');
    try {
      await del.mutateAsync(id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div>
      <h1 className="page-title">卡片管理</h1>

      <div className="card">
        <div className="field">
          <label>卡片名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：消费卡" />
        </div>
        <div className="field">
          <label>初始余额</label>
          <input type="number" step="0.01" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0.00" />
        </div>
        <button className="primary" onClick={add} disabled={!name.trim() || create.isPending}>
          添加卡片
        </button>
        {msg && <div className="err mt">{msg}</div>}
      </div>

      <div className="section-title">我的卡片</div>
      <div className="card">
        {list.length ? (
          list.map((c, i) => (
            <div className="tx" key={c.id}>
              <div>
                <div className="row-between" style={{ justifyContent: 'flex-start', gap: 8 }}>
                  <strong>{c.name}</strong>
                  {c.isDefault && <span className="badge default">默认</span>}
                </div>
                <div className="meta">初始余额 {fmtMoney(c.initialBalance)}</div>
              </div>
              <div className="row-between">
                <button className="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button className="ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                  ↓
                </button>
                <button className="ghost" onClick={() => rename(c.id, c.name)}>
                  改名
                </button>
                <button className="ghost" onClick={() => editInitial(c.id, c.initialBalance)}>
                  余额
                </button>
                {!c.isDefault && (
                  <button className="ghost" onClick={() => setDefault.mutate(c.id)}>
                    设默认
                  </button>
                )}
                <button className="danger" onClick={() => remove(c.id)}>
                  删除
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">还没有卡片，先在上方添加。</div>
        )}
      </div>

      <div className="section-title">数据备份</div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          数据只存在本机。请定期导出备份到「文件」App；换手机时在新机导入即可。
        </div>
        <div className="row-between" style={{ gap: 10 }}>
          <button onClick={doExport} style={{ flex: 1 }}>
            导出备份
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ flex: 1 }}>
            导入备份
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = '';
          }}
        />
        {backupMsg && <div className="muted mt">{backupMsg}</div>}
      </div>
    </div>
  );
}
