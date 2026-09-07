import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAddSavingsLog,
  useCards,
  useClearSavingsMonth,
  useConsumptionBudget,
  useConsumptionFunding,
  useCreateFundContribution,
  useFundPoolMonth,
  useSavingsEntries,
  useSavingsList,
  useSavingsLogs,
  useSetConsumptionBudget,
  useSetSavingsAmount,
  useSetSavingsEntry,
  useUndoFundContribution,
} from '../api/hooks';
import type { Card } from '../api/types';
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

  const card = cards.data?.find((c) => c.id === id);
  const [month, setMonth] = useState(currentMonthStr());

  const rows = list.data ?? [];
  const existing = rows.find((r) => r.month === month);

  const entries = useSavingsEntries(id, month);
  const logs = useSavingsLogs(id, month);
  const budget = useConsumptionBudget(id, month);
  const funding = useConsumptionFunding(month);
  const incomeTotal = (entries.data ?? [])
    .filter((e) => e.kind === 'INCOME')
    .reduce((s, e) => s + Number(e.amount), 0);
  const excessTotal = (entries.data ?? [])
    .filter((e) => e.kind === 'EXCESS')
    .reduce((s, e) => s + Number(e.amount), 0);

  // 三个框：真实储蓄金额 / 本月收入 / 超额支出
  const [amount, setAmount] = useState('');
  const [income, setIncome] = useState('');
  const [excess, setExcess] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);

  // 每次切月/重新进入，回显这三个框当前已保存的值（改了就是覆盖，不是累加）
  useEffect(() => {
    setAmount(existing ? existing.amount : '');
    setIncome(incomeTotal > 0 ? String(incomeTotal) : '');
    setExcess(excessTotal > 0 ? String(excessTotal) : '');
  }, [month, existing?.amount, incomeTotal, excessTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  // 回显本储蓄卡对全局消费预算的当月贡献。
  useEffect(() => {
    setBudgetInput(budget.data ?? '');
  }, [month, budget.data]);

  const savedContribution = Number(budget.data || 0);
  const savedGlobalBudget = Number(funding.data?.budget ?? 0);
  const prospectiveGlobalBudget = savedGlobalBudget - savedContribution + Number(budgetInput || 0);
  const fundingRow = funding.data?.rows.find((row) => row.savingsCardId === id);

  // 一个按钮同时提交三个框的改动；每项若真的变了就留一条带时间戳的流水，然后返回
  const saveAll = async () => {
    setSaving(true);
    try {
      const amtNew = amount === '' ? null : Number(amount);
      const amtOld = existing ? Number(existing.amount) : null;
      if (amtNew !== null && amtNew !== amtOld) {
        await addLog.mutateAsync({ cardId: id, month, field: 'AMOUNT', amount });
        await setAmt.mutateAsync({ cardId: id, month, amount });
      }
      const incNew = Number(income || 0);
      if (incNew !== incomeTotal) {
        await addLog.mutateAsync({ cardId: id, month, field: 'INCOME', amount: income || '0' });
        await setEntry.mutateAsync({ cardId: id, month, kind: 'INCOME', amount: income || '0' });
      }
      const excNew = Number(excess || 0);
      if (excNew !== excessTotal) {
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

  if (card?.savingsPurpose === 'FUND_POOL') {
    return <FundPoolCardPage card={card} />;
  }

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

      {/* 一个大卡片：月份 + 真实储蓄金额 + 本月收入 + 超额支出 + 保存并返回 */}
      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        <div className="field">
          <label>真实储蓄金额</label>
          <input
            type="number"
            step="0.01"
            placeholder="填写真实储蓄金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="field">
          <label>本月收入</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </div>

        <div className="field">
          <label>超额充值 · 额外充给全局消费账户的钱</label>
          <input
            type="number"
            step="0.01"
            placeholder="0（可留空）"
            value={excess}
            onChange={(e) => setExcess(e.target.value)}
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

      {/* 本月修改流水（只读）：每次把某项改成某值都留一条，带时间戳，最新在前 */}
      <div className="section-title">{month} · 修改流水</div>
      <div className="card">
        {logRows.length ? (
          logRows.map((l) => {
            const cleared = Number(l.amount) === 0 && l.field !== 'AMOUNT';
            const cls = l.field === 'INCOME' ? 'in' : l.field === 'EXCESS' ? 'out' : 'neutral';
            const sign = cleared
              ? ''
              : l.field === 'INCOME'
                ? '+'
                : l.field === 'EXCESS'
                  ? '−'
                  : '';
            return (
              <div className="tx" key={l.id}>
                <div>
                  <div>{FIELD_LABEL[l.field]}</div>
                  <div className="meta">{fmtDateTime(l.createdAt)}</div>
                </div>
                <span className={`amt ${cls}`}>
                  {cleared ? '清空' : `${sign}${fmtMoney(l.amount)}`}
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

function FundPoolCardPage({ card }: { card: Card }) {
  const navigate = useNavigate();
  const cards = useCards();
  const [month, setMonth] = useState(currentMonthStr());
  const pool = useFundPoolMonth(card.id, month);
  const setAmount = useSetSavingsAmount();
  const addLog = useAddSavingsLog();
  const contribute = useCreateFundContribution();
  const undo = useUndoFundContribution();
  const [startingAmount, setStartingAmount] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const funds = (cards.data ?? []).filter((row) => row.type === 'FUND');

  useEffect(() => {
    setStartingAmount(pool.data?.startingAmount ?? '');
    setAllocations({});
    setMessage('');
  }, [month, pool.data?.startingAmount]);

  const saveStartingAmount = async () => {
    if (startingAmount.trim() === '') return;
    setMessage('');
    try {
      if (Number(startingAmount) !== Number(pool.data?.startingAmount ?? 0)) {
        await addLog.mutateAsync({
          cardId: card.id,
          month,
          field: 'AMOUNT',
          amount: startingAmount,
        });
        await setAmount.mutateAsync({ cardId: card.id, month, amount: startingAmount });
      }
      setMessage('月初可投资金额已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const submitContribution = async () => {
    setMessage('');
    try {
      await contribute.mutateAsync({
        sourceCardId: card.id,
        month,
        allocations: funds.map((fund) => ({
          fundCardId: fund.id,
          amount: allocations[fund.id] ?? '',
        })),
      });
      setAllocations({});
      setMessage('注资已记录');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '注资失败');
    }
  };

  return (
    <div>
      <div className="detail-header">
        <button className="ghost" onClick={() => navigate('/savings')}>
          ‹ 储蓄
        </button>
        <div className="detail-title">
          <strong>{card.name}</strong>
          <span className="type-tag">基金资金卡</span>
        </div>
        <span style={{ width: 40 }} />
      </div>

      <div className="card">
        <div className="field">
          <label>月份</label>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="field">
          <label>月初可投资金额</label>
          <input
            type="number"
            step="0.01"
            placeholder="本月转入资金卡的金额"
            value={startingAmount}
            onChange={(event) => setStartingAmount(event.target.value)}
          />
        </div>
        <button
          className="primary"
          onClick={saveStartingAmount}
          disabled={!startingAmount || setAmount.isPending}
        >
          保存月初金额
        </button>
        <div className="stat mt">
          <div className="box">
            <div className="k">已注资</div>
            <div className="v">{fmtMoney(pool.data?.allocated ?? '0')}</div>
          </div>
          <div className="box">
            <div className="k">尚可注资</div>
            <div className="v">
              {pool.data?.available === null || pool.data?.available === undefined
                ? '未填'
                : fmtMoney(pool.data.available)}
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">{month} · 月末给基金注资</div>
      <div className="card">
        {funds.length ? (
          funds.map((fund) => (
            <div className="field" key={fund.id}>
              <label>{fund.name}</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={allocations[fund.id] ?? ''}
                onChange={(event) =>
                  setAllocations((current) => ({ ...current, [fund.id]: event.target.value }))
                }
              />
            </div>
          ))
        ) : (
          <div className="muted">请先在“基金”页新建基金。</div>
        )}
        <button
          className="primary"
          onClick={submitContribution}
          disabled={
            !funds.length ||
            contribute.isPending ||
            !Object.values(allocations).some((value) => Number(value) > 0)
          }
        >
          确认注资
        </button>
        {message && <div className="muted mt">{message}</div>}
      </div>

      <div className="section-title">{month} · 注资记录</div>
      <div className="card">
        {pool.data?.batches.length ? (
          pool.data.batches.map((batch) => (
            <div className="tx" key={batch.batchId}>
              <div>
                <div>
                  {batch.items
                    .map((item) => `${item.fundName} ${fmtMoney(item.amount)}`)
                    .join(' · ')}
                </div>
                <div className="meta">
                  {fmtDateTime(batch.createdAt)} · 合计 {fmtMoney(batch.total)}
                </div>
              </div>
              <button
                className="mini danger"
                onClick={async () => {
                  if (!window.confirm(`撤销本批注资 ${fmtMoney(batch.total)}？`)) return;
                  await undo.mutateAsync(batch.batchId);
                }}
                disabled={undo.isPending}
              >
                撤销
              </button>
            </div>
          ))
        ) : (
          <div className="muted">本月还没有注资记录</div>
        )}
      </div>

      <CardManageBar
        cardId={card.id}
        name={card.name}
        initialBalance={card.initialBalance}
        showInitial
        onDeleted={() => navigate('/savings')}
      />
    </div>
  );
}
