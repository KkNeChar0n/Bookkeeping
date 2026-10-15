import { useRef, useState } from 'react';
import { useBookkeepingStart, useRestartBookkeeping } from '../api/hooks';
import { currentMonthStr, fmtDateTime } from '../lib/format';
import { backupService } from '../services/backup.service';
import { ConsumptionHistoryRecoveryPanel } from './ConsumptionHistoryRecoveryPanel';

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
      `将从 ${currentMonthStr()} 手工重新起账。\n\n你已确认起账前备份文件保存成功。现在将删除所有旧预算、储蓄余额、收入、基金、修改日志、未来资金计划和本地旧账归档，并清零所有卡片期初。保留卡片、分类、全部消费记录，以及截至起账月各月的消费定额和超额充值；消费继续按完整历史累计，旧资产不参与新账对账。\n\n不会自动填写预算或资产，清账后需按累计口径重新填写。应用内不保留旧资产账；恢复完整旧账须导入下载的备份，且会覆盖新账。确定清账？`,
    )) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      // A download request is not proof of a saved file; require explicit confirmation first.
      await restart.mutateAsync();
      setOpen(false);
      resetConfirmation();
      setMessage('清账完成，消费记录、历史消费定额和超额充值已保留。请按累计口径填写新预算、储蓄和基金，并妥善保管起账前备份。');
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
          删除旧资产预算、储蓄余额、收入、基金及修改记录，保留卡片、分类、消费明细，以及截至起账月各月的消费定额和超额充值。消费持续累计，资产重新起账。先下载完整备份，应用内不再保存旧资产账归档。
          {start.data && <div className="mt">新账起账月份：{start.data.startDate.slice(0, 7)} · 操作时间：{fmtDateTime(start.data.createdAt)}</div>}
        </div>
        <div className="detail-sub">清账后怎么填</div>
        <div className="muted mt" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>1. 核实同一当前时点的各储蓄卡真实余额、基金市值和独立基金现金。基金现金不能同时计入其他卡余额。</div>
          <div>2. 在预算中手填各卡期初，合计 = 当前银行余额合计 + 截至起账月累计消费定额 + 累计超额充值 + 基金市值 + 独立基金现金。基金总额只加一次，可放在其中一张卡的预算期初中。</div>
          <div>3. 在起账月预算记一次“累计消费定额”支出，金额为截至起账月全部定额合计；不要补记旧月资产流水，不要把超额充值再记预算支出。储蓄页填当前真实余额，核对保留的各月完整定额贡献与超额充值。以后的月份正常记当月完整定额支出。</div>
          <div>4. 基金页确认起账月的当前市值和独立现金，首次净投入填 0；确认后才记录后续买入减赎回。没有基金也需确认两个值为 0。</div>
          <div>5. 消费、定额、超额充值与逐月超支持续按完整历史累计，结转仍按历史资金计算；不会再扣一次当前银行余额。已包含在当前余额里的旧收入不要补记；起账后的新收入在预算与储蓄两边对应记录。未来资金计划需重新填写。</div>
          {start.data?.manualOpening && !start.data.consumptionHistory && <div className="warn mt">当前新账由旧版本建立，仍沿用只统计起账后消费的口径。请先通过下方“恢复历史消费资金”核对并恢复，再按上述累计公式填写；升级不会自动猜测已清掉的资金。</div>}
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
              <span>我确认删除旧资产记录，保留消费明细、历史消费定额和超额充值，并按累计口径手工填写新账。</span>
            </label>
            <div className="row-between mt" style={{ gap: 8 }}>
              <button className="ghost" disabled={busy} onClick={() => { setOpen(false); resetConfirmation(); setMessage(''); }}>取消</button>
              <button className="danger" disabled={busy || !confirmed || !backupPrepared || !backupConfirmed} onClick={submit}>{busy && !downloading ? '正在清账…' : '确认清账，只保留消费'}</button>
            </div>
          </>
        )}
        {message && <div className="muted mt" role="status">{message}</div>}
      </div>
      <ConsumptionHistoryRecoveryPanel />
    </>
  );
}
