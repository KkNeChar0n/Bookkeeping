import { useRef, useState } from 'react';
import { useBookkeepingStart, useRestoreConsumptionHistory } from '../api/hooks';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { backupService } from '../services/backup.service';
import {
  consumptionHistoryRecoveryService,
  type ConsumptionHistoryPreview,
} from '../services/consumptionHistoryRecovery.service';

/** Recover only consumption funding; never replace the current asset ledger. */
export function ConsumptionHistoryRecoveryPanel() {
  const start = useBookkeepingStart().data;
  const restore = useRestoreConsumptionHistory();
  const fileRef = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const [source, setSource] = useState<unknown>();
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ConsumptionHistoryPreview>();
  const [backupPrepared, setBackupPrepared] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!start?.manualOpening) return null;

  const inspect = async (file: File) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setSource(undefined);
    setPreview(undefined);
    setFileName('');
    setBackupPrepared(false);
    setBackupConfirmed(false);
    setConfirmed(false);
    setMessage('');
    try {
      const input: unknown = JSON.parse(await file.text());
      const result = await consumptionHistoryRecoveryService.preview(input);
      setSource(input);
      setPreview(result);
      setFileName(file.name);
      setMessage('预览完成，当前账本尚未修改。请核对各月金额，并先保存当前新账备份。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '备份预览失败，未修改账本');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const prepareBackup = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setBackupPrepared(false);
    setBackupConfirmed(false);
    setMessage('');
    try {
      await backupService.downloadBackup();
      setBackupPrepared(true);
      setMessage('已发起当前新账备份下载。请确认文件已经保存成功；此时仍未恢复消费资金。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '当前账本备份失败，不能恢复');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const submit = async () => {
    if (working.current || !preview || source === undefined || !backupPrepared || !backupConfirmed || !confirmed) return;
    if (!window.confirm(
      `将从所选备份补回截至 ${preview.throughMonth} 缺失的各月消费定额和超额充值，并启用完整历史累计消费口径。\n\n已存在的卡片月份资金值保持不变。不导入旧消费流水、预算、储蓄余额、收入、基金或修改日志，不改当前真实资产和固定基金基准。\n\n启用后请按累计定额与累计充值检查手工预算期初；不会自动调整或调平。确定继续？`,
    )) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await restore.mutateAsync(source);
      setSource(undefined);
      setPreview(undefined);
      setFileName('');
      setBackupPrepared(false);
      setBackupConfirmed(false);
      setConfirmed(false);
      setMessage(`已补回缺失消费资金：消费定额 ${result.budgetRows} 组、超额充值 ${result.excessRows} 组；已有 ${result.skippedExisting} 组保留不变。消费现按完整历史累计，当前资产记录未改动。请按上方累计口径检查预算期初及定额支出。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败，未完成消费资金恢复');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-title">恢复历史消费资金</div>
      <div className="card">
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          {start.consumptionHistory
            ? '消费已采用完整历史累计口径。如有清账时遗漏的定额或超额充值，可从清账前备份补回。'
            : '此前版本清账会删除消费定额与超额充值，并只统计起账后的消费。选择清账前的完整备份，核对后仅恢复消费资金，启用完整历史累计。'}
          仅补缺失的各卡各月定额与超额充值；已填资金不覆盖，起账月之后的备份计划跳过。不导入消费流水，不恢复旧预算、余额、收入、基金或日志。
        </div>
        <button className="mt" disabled={busy} onClick={() => fileRef.current?.click()}>选择清账前备份，预览消费资金</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspect(file);
            event.target.value = '';
          }}
        />
        {preview && <>
          <div className="detail-sub mt">只读预览 · {fileName}</div>
          <div className="muted mt" style={{ fontSize: 12 }}>备份导出时间：{fmtDateTime(Date.parse(preview.exportedAt))}；仅取截至 {preview.throughMonth} 的消费资金。</div>
          {preview.months.map((row) => (
            <div className="sum-row" key={row.month}>
              <span>{row.month}</span>
              <span>定额 {fmtMoney(row.budget)} · 超额充值 {fmtMoney(row.excess)}</span>
            </div>
          ))}
          <div className="sum-row total">
            <span>备份合计</span>
            <span>定额 {fmtMoney(preview.totalBudget)} · 超额充值 {fmtMoney(preview.totalExcess)}</span>
          </div>
          <div className="muted mt" style={{ fontSize: 12 }}>
            待补入：定额 {preview.budgetRows} 组、超额充值 {preview.excessRows} 组（按卡片和月份计）。
            已存在 {preview.skippedExisting} 组，保留当前值；跳过未来 {preview.skippedFuture} 条记录。
            上述合计为备份金额，并非恢复后账本合计。
          </div>
          <div className="warn mt">恢复不会重扣银行余额，也不会自动改预算期初。若你已按仅本月口径填过新账，请按累计口径重新核对预算期初与定额支出；不要重复补记旧收入或旧资产流水。</div>
          <button className="mt" disabled={busy} onClick={prepareBackup}>下载当前新账备份</button>
          <label className="mt" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={backupConfirmed} disabled={busy || !backupPrepared} onChange={(event) => setBackupConfirmed(event.target.checked)} />
            <span>我已确认当前新账备份文件保存成功。</span>
          </label>
          <label className="mt" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>我已核对预览，确认仅补缺失消费资金，并启用完整历史累计口径。</span>
          </label>
          <button className="mt" disabled={busy || !backupPrepared || !backupConfirmed || !confirmed} onClick={submit}>{busy ? '正在处理…' : '确认恢复消费资金'}</button>
        </>}
        {message && <div className="muted mt" role="status">{message}</div>}
      </div>
    </>
  );
}
