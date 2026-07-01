import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { backupService } from '../services/backup.service';

/** 导出/导入备份（放在消费、储蓄页面各一份） */
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
    </>
  );
}
