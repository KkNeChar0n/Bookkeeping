import { useRef, useState } from 'react';
import { useBookkeepingStart, useRestartBookkeeping } from '../api/hooks';
import { currentMonthStr, fmtDateTime } from '../lib/format';
import { backupService } from '../services/backup.service';

export function BookkeepingRestartPanel() {
  const start = useBookkeepingStart();
  const restart = useRestartBookkeeping();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [backupPrepared, setBackupPrepared] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);

  const resetConfirmation = () => {
    setConfirmed(false);
    setBackupPrepared(false);
    setBackupConfirmed(false);
  };

  const prepareBackup = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setDownloading(true);
    setBackupPrepared(false);
    setBackupConfirmed(false);
    setMessage('');
    try {
      await backupService.downloadBackup();
      setBackupPrepared(true);
      setMessage('已发起起账前完整备份下载。请先查看下载目录，确认备份文件已经保存成功，再勾选备份确认；此时还没有清账。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '备份下载失败，不能清账');
    } finally {
      submitting.current = false;
      setBusy(false);
      setDownloading(false);
    }
  };

  const submit = async () => {
    if (submitting.current || !confirmed || !backupPrepared || !backupConfirmed) return;
    if (!window.confirm(
      `将从 ${currentMonthStr()} 手工重新起账。\n\n你已确认起账前备份文件保存成功。现在将删除所有旧预算、储蓄余额、收入、充值、基金、修改日志、未来计划和本地旧账归档，并清零所有卡片期初。只保留卡片、分类和消费记录；本月全部消费继续计入本月额度，更早月份仅供查询。\n\n不会自动填写预算或资产，清账后需按指引重新填写。应用内不保留旧账；如需恢复，只能导入下载的备份，且会覆盖新账。确定清账？`,
    )) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      // A download request is not proof of a saved file; require explicit confirmation first.
      await restart.mutateAsync();
      setOpen(false);
      resetConfirmation();
      setMessage('清账完成，消费记录已保留。请按页面指引填写新预算、储蓄和基金，并妥善保管起账前备份。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '起账失败，未完成重置');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-title">重新起账 · 只保留消费</div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          删除旧预算、储蓄、基金及修改记录，只保留卡片、分类和消费。先下载完整备份，应用内不再保存旧账归档。
          {start.data && <div className="mt">新账起账月份：{start.data.startDate.slice(0, 7)} · 操作时间：{fmtDateTime(start.data.createdAt)}</div>}
        </div>
        <div className="detail-sub">清账后怎么填</div>
        <div className="muted mt" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>1. 核实同一当前时点的各储蓄卡真实余额、基金市值和独立基金现金。基金现金不能同时计入其他卡余额。</div>
          <div>2. 在预算中手填各卡期初，合计 = 当前银行余额合计 + 起账月消费定额 + 起账月超额充值 + 基金市值 + 独立基金现金。基金总额只加一次，可放在其中一张卡的预算期初中。</div>
          <div>3. 预算中再记一次起账月的正常定额支出，不要把本月超额充值再记成预算支出。储蓄页填当前真实余额、起账月完整的消费定额贡献和超额充值；初月不带旧结转。</div>
          <div>4. 基金页确认起账月的当前市值和独立现金，首次净投入填 0；确认后才记录后续买入减赎回。没有基金也需确认两个值为 0。</div>
          <div>5. 本月全部消费记录仍参与本月额度。已包含在当前余额里的旧收入不要补记；起账后的新收入在预算与储蓄两边对应记录。未来计划需重新填写。</div>
        </div>
        {!open ? (
          <button className="danger mt" onClick={() => { setOpen(true); resetConfirmation(); setMessage(''); }} disabled={start.isPending}>准备清账，只保留消费</button>
        ) : (
          <>
            <div className="warn mt">先下载并核实备份文件保存成功，再确认清账。本操作会删除旧资产记录，不会自动调平。恢复须导入下载的备份，会覆盖之后的新账。</div>
            <button className="mt" disabled={busy} onClick={prepareBackup}>{downloading ? '正在准备备份下载…' : '下载起账前备份'}</button>
            <label className="mt" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={backupConfirmed} disabled={busy || !backupPrepared} onChange={(event) => setBackupConfirmed(event.target.checked)} />
              <span>我已确认备份文件保存成功。</span>
            </label>
            <label className="mt" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>我确认删除所有旧预算、储蓄和基金记录，只保留消费，并按指引手工填写新账。</span>
            </label>
            <div className="row-between mt" style={{ gap: 8 }}>
              <button className="ghost" disabled={busy} onClick={() => { setOpen(false); resetConfirmation(); setMessage(''); }}>取消</button>
              <button className="danger" disabled={busy || !confirmed || !backupPrepared || !backupConfirmed} onClick={submit}>{busy && !downloading ? '正在清账…' : '确认清账，只保留消费'}</button>
            </div>
          </>
        )}
        {message && <div className="muted mt" role="status">{message}</div>}
      </div>
    </>
  );
}
