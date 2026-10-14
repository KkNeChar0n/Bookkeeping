import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { backupService } from '../services/backup.service';

/** Export/import the complete local ledger. */
export function BackupPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const doExport = async () => {
    setMsg('');
    try {
      await backupService.downloadBackup();
      setMsg('已导出备份文件');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导出失败');
    }
  };

  const doImport = async (file: File) => {
    if (!window.confirm('导入会覆盖当前全部数据，确定继续？')) return;
    setMsg('');
    try {
      const r = await backupService.importFromFile(file);
      qc.invalidateQueries();
      setMsg(`导入成功：卡 ${r.cards}、流水 ${r.transactions}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败');
    }
  };

  const doClear = async () => {
    if (
      !window.confirm(
        '将删除全部储蓄卡、消费流水、预算、消费预算、修改日志、基金净投入、历史对账起点、重新起账配置和全部本地旧账归档；保留基金市值与预充金额。此操作不可撤销，确定？',
      )
    )
      return;
    if (
      !window.confirm(
        '再确认一次：净投入和历史对账起点依赖旧账本，清空后都会删除，新账本需要重新设置起点并逐月确认。建议先「导出备份」。',
      )
    )
      return;
    setMsg('');
    try {
      await backupService.clearAllExceptFund();
      qc.invalidateQueries();
      setMsg('已清空（基金市值与预充已保留；净投入和历史对账起点已清除，需重新确认）');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '清空失败');
    }
  };

  return (
    <>
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
        {msg && <div className="muted mt">{msg}</div>}
      </div>

      <div className="section-title">危险操作</div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          清空普通账本后，基金市值与预充金额会保留，但历史净投入和对账起点会删除；新账本不会把未知净投入自动当作
          0。重新起账配置和本地旧账归档也会删除。若要保留历史消费，请使用上方「重新起账」，不要清空。清空前建议先导出备份。
        </div>
        <button className="danger" style={{ width: '100%' }} onClick={doClear}>
          清空普通账本（保留基金市值与预充）
        </button>
      </div>
    </>
  );
}
