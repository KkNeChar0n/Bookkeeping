import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddSavingsLog,
  useAssetTransfers,
  useCards,
  useClearSavingsMonth,
  useConsumptionBudget,
  useConsumptionFunding,
  useCreateAssetTransfer,
  useSavingsEntries,
  useSavingsList,
  useSavingsLogs,
  useRemoveAssetTransfer,
  useSetConsumptionBudget,
  useSetSavingsAmount,
  useSetSavingsEntry,
} from '../api/hooks';
import { CardManageBar } from '../components/CardManageBar';
import { currentMonthStr, fmtDateTime, fmtMoney } from '../lib/format';

const FIELD_LABEL = { AMOUNT: '真实储蓄金额', INCOME: '本月收入', EXCESS: '超额支出' } as const;

export function SavingsCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cards = useCards();
  const list = useSavingsList(id);
  const setAmt = useSetSavingsAmount();
  const setEntry = useSetSavingsEntry();
  const addLog = useAddSavingsLog();
  const setCBudget = useSetConsumptionBudget();
  const clearMonth = useClearSavingsMonth();

  const card = cards.data?.find((item) => item.id === id);
  const [month, setMonth] = useState(currentMonthStr());
  const rows = list.data ?? [];
  const existing = rows.find((row) => row.month === month);
  const entries = useSavingsEntries(id, month);
  const logs = useSavingsLogs(id, month);
  const budget = useConsumptionBudget(id, month);
  const funding = useConsumptionFunding(month);
  const assetTransfers = useAssetTransfers({ cardId: id, month });
  const createAssetTransfer = useCreateAssetTransfer();
  const removeAssetTransfer = useRemoveAssetTransfer();
  const incomeTotal = (entries.data ?? [])
    .filter((entry) => entry.kind === 'INCOME')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const excessTotal = (entries.data ?? [])
    .filter((entry) => entry.kind === 'EXCESS')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  const [amount, setAmount] = useState('');
  const [income, setIncome] = useState('');
  const [excess, setExcess] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(`${currentMonthStr()}-01`);
  const [transferNote, setTransferNote] = useState('');
  const [principalAlreadyIncluded, setPrincipalAlreadyIncluded] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    setAmount(existing ? existing.amount : '');
    setIncome(incomeTotal > 0 ? String(incomeTotal) : '');
    setExcess(excessTotal > 0 ? String(excessTotal) : '');
  }, [month, existing?.amount, incomeTotal, excessTotal]);

  useEffect(() => {
    setBudgetInput(budget.data ?? '');
  }, [month, budget.data]);

  useEffect(() => {
    setTransferDate(`${month}-01`);
  }, [month]);

  const savedContribution = Number(budget.data || 0);
  const savedGlobalBudget = Number(funding.data?.budget ?? 0);
  const prospectiveGlobalBudget = savedGlobalBudget - savedContribution + Number(budgetInput || 0);
  const fundingRow = funding.data?.rows.find((row) => row.savingsCardId === id);

  const saveAll = async () => {
    setSaving(true);
    try {
      const nextAmount = amount === '' ? null : Number(amount);
      const oldAmount = existing ? Number(existing.amount) : null;
      if (nextAmount !== null && nextAmount !== oldAmount) {
        await addLog.mutateAsync({ cardId: id, month, field: 'AMOUNT', amount });
        await setAmt.mutateAsync({ cardId: id, month, amount });
      }
      if (Number(income || 0) !== incomeTotal) {
        await addLog.mutateAsync({ cardId: id, month, field: 'INCOME', amount: income || '0' });
        await setEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: income || '0' });
      }
      if (Number(excess || 0) !== excessTotal) {
        await addLog.mutateAsync({ cardId: id, month, field: 'EXCESS', amount: excess || '0' });
        await setEntry.mutateAsync({ cardId: id, month, kind: 'EXCESS', amount: excess || '0' });
      }
      if (Number(budgetInput || 0) !== savedContribution) {
        await setCBudget.mutateAsync({ savingsCardId: id, month, amount: budgetInput || '0' });
      }
      navigate('/savings');
    } finally {
      setSaving(false);
    }
  };

  const logRows = logs.data ?? [];
  const transferTargets = (cards.data ?? []).filter(
    (item) => item.id !== id && (item.type === 'SAVINGS' || item.type === 'FUND'),
  );
  const transferTarget = transferTargets.find((item) => item.id === transferTargetId);

  const submitTransfer = async () => {
    setTransferError('');
    if (!transferTarget) {
      setTransferError('请选择去向');
      return;
    }
    try {
      await createAssetTransfer.mutateAsync({
        sourceCardId: id,
        targetCardId: transferTarget.id,
        targetKind: transferTarget.type === 'FUND' ? 'FUND_PRINCIPAL' : 'SAVINGS',
        amount: transferAmount,
        date: transferDate,
        note: transferNote,
        principalAlreadyIncluded:
          transferTarget.type === 'FUND' ? principalAlreadyIncluded : false,
      });
      setTransferAmount('');
      setTransferNote('');
      setPrincipalAlreadyIncluded(false);
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : '资产划转失败');
    }
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate('/savings')}>
          ‹ 储蓄
        </button>
        <div className="detail-title">
          <strong>{card?.name ?? '储蓄卡'}</strong>
          <span className="type-tag">储蓄</span>
        </div>
        <span style={{ width: 40 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="field">
          <label>真实储蓄金额</label>
          <input
            type="number"
            step="0.01"
            placeholder="填写真实储蓄金额"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="field">
          <label>本月收入</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={income}
            onChange={(event) => setIncome(event.target.value)}
          />
        </div>
        <div className="field">
          <label>超额充值 · 额外充给全局消费账户的钱</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={excess}
            onChange={(event) => setExcess(event.target.value)}
          />
        </div>
        <div className="divider" />
        <div className="field" style={{ margin: 0 }}>
          <label>本卡对 {month} 全局消费预算的贡献</label>
          <input
            type="number"
            step="0.01"
            placeholder="0"
            value={budgetInput}
            onChange={(event) => setBudgetInput(event.target.value)}
          />
          <div className="muted mt" style={{ fontSize: 12 }}>
            保存后全局消费额度 {fmtMoney(prospectiveGlobalBudget)}（所有储蓄卡当月贡献之和）
          </div>
          {fundingRow && Number(fundingRow.amount) > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              当前已保存贡献 {fmtMoney(fundingRow.amount)} ＝ 分配结转 {fmtMoney(fundingRow.carry)}{' '}
              ＋ 本卡新转账 {fmtMoney(fundingRow.newTransfer)}；全局期初预充{' '}
              {fmtMoney(funding.data?.prepaidStart ?? '0')}
            </div>
          )}
        </div>
        <button className="primary" onClick={saveAll} disabled={saving}>
          保存并返回
        </button>
        <button
          className="danger"
          style={{ width: '100%', marginTop: 8 }}
          onClick={async () => {
            if (
              !window.confirm(
                `清除 ${month} 的全部数据（真实金额、收入、超额支出、消费预算、修改流水），恢复到初始状态？`,
              )
            )
              return;
            await clearMonth.mutateAsync({ cardId: id, month });
          }}
          disabled={clearMonth.isPending}
        >
          清除本月数据
        </button>
      </div>

      <div className="section-title">{month} · 资产划转</div>
      <div className="card">
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          用于说明卡与卡、卡与基金之间的钱去了哪里；不会自动改写你填写的月度真实金额。
        </div>
        <div className="field">
          <label>去向</label>
          <select
            value={transferTargetId}
            onChange={(event) => {
              setTransferTargetId(event.target.value);
              setPrincipalAlreadyIncluded(false);
            }}
          >
            <option value="">请选择</option>
            {transferTargets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.type === 'FUND' ? '基金本金' : '储蓄卡'} · {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>金额</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={transferAmount}
            onChange={(event) => setTransferAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="field">
          <label>日期</label>
          <input
            type="date"
            value={transferDate}
            onChange={(event) => setTransferDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label>备注（可选）</label>
          <input value={transferNote} onChange={(event) => setTransferNote(event.target.value)} />
        </div>
        {transferTarget?.type === 'FUND' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={principalAlreadyIncluded}
              onChange={(event) => setPrincipalAlreadyIncluded(event.target.checked)}
            />
            <span>
              历史补录：这笔钱已经包含在当前基金本金中（勾选后不会再次增加本金）
            </span>
          </label>
        )}
        <button
          className="primary"
          onClick={submitTransfer}
          disabled={createAssetTransfer.isPending || !transferTargetId || !transferAmount}
        >
          记录划转
        </button>
        {transferError && <div className="warn mt">{transferError}</div>}
      </div>

      <div className="card">
        {(assetTransfers.data ?? []).length ? (
          (assetTransfers.data ?? []).map((row) => {
            const outgoing = row.sourceCardId === id;
            return (
              <div className="tx" key={row.id}>
                <div>
                  <div>
                    {outgoing ? `转到 ${row.targetCardName}` : `来自 ${row.sourceCardName}`}
                    {row.targetKind === 'FUND_PRINCIPAL' && !row.principalApplied
                      ? ' · 本金已包含'
                      : ''}
                  </div>
                  <div className="meta">
                    {row.date}
                    {row.note ? ` · ${row.note}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`amt ${outgoing ? 'out' : 'in'}`}>
                    {outgoing ? '−' : '+'}
                    {fmtMoney(row.amount)}
                  </div>
                  <button
                    className="mini danger"
                    onClick={async () => {
                      if (!window.confirm('撤销这笔资产划转？')) return;
                      await removeAssetTransfer.mutateAsync(row.id);
                    }}
                  >
                    撤销
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="muted">本月还没有资产划转</div>
        )}
      </div>

      <div className="section-title">{month} · 修改流水</div>
      <div className="card">
        {logRows.length ? (
          logRows.map((log) => {
            const cleared = Number(log.amount) === 0 && log.field !== 'AMOUNT';
            const cls = log.field === 'INCOME' ? 'in' : log.field === 'EXCESS' ? 'out' : 'neutral';
            const sign = cleared
              ? ''
              : log.field === 'INCOME'
                ? '+'
                : log.field === 'EXCESS'
                  ? '−'
                  : '';
            return (
              <div className="tx" key={log.id}>
                <div>
                  <div>{FIELD_LABEL[log.field]}</div>
                  <div className="meta">{fmtDateTime(log.createdAt)}</div>
                </div>
                <span className={`amt ${cls}`}>
                  {cleared ? '清空' : `${sign}${fmtMoney(log.amount)}`}
                </span>
              </div>
            );
          })
        ) : (
          <div className="muted">本月还没有修改</div>
        )}
      </div>

      {card && (
        <CardManageBar
          cardId={id}
          name={card.name}
          initialBalance={card.initialBalance}
          showInitial
          onDeleted={() => navigate('/savings')}
        />
      )}
    </div>
  );
}
