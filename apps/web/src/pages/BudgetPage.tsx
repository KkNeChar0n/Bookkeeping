import { useEffect, useMemo, useState } from 'react';
import {
  useBudgets,
  useCards,
  useCreateSnapshot,
  useDeleteSnapshot,
  useSetBudgetLine,
} from '../api/hooks';
import { fmtMoney, todayStr } from '../lib/format';

export function BudgetPage() {
  const budgets = useBudgets();
  const cards = useCards();
  const createSnap = useCreateSnapshot();
  const setLine = useSetBudgetLine();
  const delSnap = useDeleteSnapshot();

  const [selectedId, setSelectedId] = useState('');
  const [newDate, setNewDate] = useState(todayStr());
  const [msg, setMsg] = useState('');

  // 只有储蓄卡需要做预算
  const savingsIds = useMemo(
    () => new Set((cards.data ?? []).filter((c) => c.type === 'SAVINGS').map((c) => c.id)),
    [cards.data],
  );
  const savingsLines = <T extends { cardId: string }>(lines: T[]): T[] =>
    lines.filter((l) => savingsIds.has(l.cardId));

  // 默认选最新快照
  useEffect(() => {
    if (budgets.data?.length && !budgets.data.find((s) => s.id === selectedId)) {
      setSelectedId(budgets.data[budgets.data.length - 1].id);
    }
  }, [budgets.data, selectedId]);

  const snap = budgets.data?.find((s) => s.id === selectedId);

  const createSnapshot = async () => {
    setMsg('');
    try {
      const s = await createSnap.mutateAsync({ date: newDate });
      setSelectedId(s.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '创建失败');
    }
  };

  const commitLine = (cardId: string, field: 'inAmount' | 'outAmount', value: string) => {
    if (!snap) return;
    setLine.mutate({ snapshotId: snap.id, cardId, [field]: value || '0' });
  };

  const removeSnapshot = async (id: string, date: string) => {
    if (!window.confirm(`确定删除 ${date} 的预算节点？`)) return;
    setMsg('');
    try {
      await delSnap.mutateAsync(id);
      if (selectedId === id) setSelectedId('');
      setMsg(`已删除 ${date}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败');
    }
  };


  return (
    <div>
      <h1 className="page-title">预收预算</h1>

      <div className="card">
        <label className="muted" style={{ display: 'block', marginBottom: 6 }}>
          新建或打开某日期的预算
        </label>
        <div className="row-between">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button onClick={createSnapshot} disabled={createSnap.isPending}>
            新建/打开
          </button>
        </div>
        {msg && <div className="err">{msg}</div>}
      </div>

      <div className="section-title">所有预算节点</div>
      <div className="card">
        {budgets.data?.length ? (
          [...budgets.data]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((s) => (
              <div
                key={s.id}
                className={`snap-item${s.id === selectedId ? ' active' : ''}`}
                onClick={() => setSelectedId(s.id)}
                role="button"
                tabIndex={0}
              >
                <div className="snap-head">
                  <strong>{s.date}</strong>
                  <div className="row-between" style={{ gap: 10 }}>
                    <span className="snap-total">
                      合计 {fmtMoney(savingsLines(s.lines).reduce((a, l) => a + Number(l.balance), 0))}
                    </span>
                    <button
                      className="ghost"
                      title="删除此节点"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSnapshot(s.id, s.date);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="snap-cards">
                  {savingsLines(s.lines).map((l) => (
                    <span key={l.cardId} className="snap-chip">
                      {l.cardName} {fmtMoney(l.balance)}
                    </span>
                  ))}
                </div>
              </div>
            ))
        ) : (
          <div className="muted">还没有预算节点，用上方日期新建一个。</div>
        )}
      </div>

      {snap && (
        <>
          <div className="section-title">编辑 {snap.date} · 储蓄卡计划收入 / 调出（预算余额自动算）</div>
          <div className="card">
            {savingsLines(snap.lines).length ? (
              <table>
                <thead>
                  <tr>
                    <th>储蓄卡</th>
                    <th>计划收入</th>
                    <th>计划调出</th>
                    <th>预算余额</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsLines(snap.lines).map((l) => (
                    <tr key={l.cardId}>
                      <td>{l.cardName}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={l.inAmount === '0.00' ? '' : l.inAmount}
                          onBlur={(e) => commitLine(l.cardId, 'inAmount', e.target.value)}
                          style={{ minWidth: 64 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={l.outAmount === '0.00' ? '' : l.outAmount}
                          onBlur={(e) => commitLine(l.cardId, 'outAmount', e.target.value)}
                          style={{ minWidth: 64 }}
                        />
                      </td>
                      <td>{fmtMoney(l.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>合计</strong>
                    </td>
                    <td>
                      {fmtMoney(savingsLines(snap.lines).reduce((a, l) => a + Number(l.inAmount), 0))}
                    </td>
                    <td>
                      {fmtMoney(savingsLines(snap.lines).reduce((a, l) => a + Number(l.outAmount), 0))}
                    </td>
                    <td>
                      <strong>
                        {fmtMoney(savingsLines(snap.lines).reduce((a, l) => a + Number(l.balance), 0))}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="muted">没有储蓄卡。去「卡片」页添加储蓄卡后再来做预算。</div>
            )}
            <div className="muted mt">修改后离开输入框即自动保存。仅储蓄卡需要做预算。</div>
          </div>
        </>
      )}
    </div>
  );
}
