import { useEffect, useState } from 'react';
import {
  useBudgets,
  useBudgetTransfer,
  useCreateSnapshot,
  useDeleteSnapshot,
  useSetBudgetLine,
} from '../api/hooks';
import { fmtMoney, todayStr } from '../lib/format';

export function BudgetPage() {
  const budgets = useBudgets();
  const createSnap = useCreateSnapshot();
  const setLine = useSetBudgetLine();
  const budgetTransfer = useBudgetTransfer();
  const delSnap = useDeleteSnapshot();

  const [selectedId, setSelectedId] = useState('');
  const [newDate, setNewDate] = useState(todayStr());
  const [msg, setMsg] = useState('');

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

  // 预算层调账
  const [tCard, setTCard] = useState('');
  const [tPeer, setTPeer] = useState('');
  const [tDir, setTDir] = useState<'OUT' | 'IN'>('OUT');
  const [tAmt, setTAmt] = useState('');

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

  const doTransfer = async () => {
    if (!snap) return;
    setMsg('');
    try {
      await budgetTransfer.mutateAsync({
        snapshotId: snap.id,
        cardId: tCard,
        direction: tDir,
        peerCardId: tPeer,
        amount: tAmt,
      });
      setTAmt('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '调账失败');
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
                    <span className="snap-total">合计 {fmtMoney(s.totals.balance)}</span>
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
                  {s.lines.map((l) => (
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
          <div className="section-title">编辑 {snap.date} · 各卡收 / 支（余额自动计算）</div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>卡片</th>
                  <th>收</th>
                  <th>支</th>
                  <th>余额</th>
                </tr>
              </thead>
              <tbody>
                {snap.lines.map((l) => (
                  <tr key={l.cardId}>
                    <td>{l.cardName}</td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={l.inAmount === '0.00' ? '' : l.inAmount}
                        onBlur={(e) => commitLine(l.cardId, 'inAmount', e.target.value)}
                        style={{ minWidth: 70 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={l.outAmount === '0.00' ? '' : l.outAmount}
                        onBlur={(e) => commitLine(l.cardId, 'outAmount', e.target.value)}
                        style={{ minWidth: 70 }}
                      />
                    </td>
                    <td>{fmtMoney(l.balance)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>合计</strong>
                  </td>
                  <td>{fmtMoney(snap.totals.inAmount)}</td>
                  <td>{fmtMoney(snap.totals.outAmount)}</td>
                  <td>
                    <strong>{fmtMoney(snap.totals.balance)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="muted mt">修改后离开输入框即自动保存。</div>
          </div>

          <div className="section-title">预算层调账（零和）</div>
          <div className="card">
            <div className="field">
              <label>当前卡</label>
              <select value={tCard} onChange={(e) => setTCard(e.target.value)}>
                <option value="">选择</option>
                {snap.lines.map((l) => (
                  <option key={l.cardId} value={l.cardId}>
                    {l.cardName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>方向</label>
              <div className="seg">
                <button type="button" className={tDir === 'OUT' ? 'active' : ''} onClick={() => setTDir('OUT')}>
                  调出
                </button>
                <button type="button" className={tDir === 'IN' ? 'active' : ''} onClick={() => setTDir('IN')}>
                  调入
                </button>
              </div>
            </div>
            <div className="field">
              <label>对手卡</label>
              <select value={tPeer} onChange={(e) => setTPeer(e.target.value)}>
                <option value="">选择</option>
                {snap.lines
                  .filter((l) => l.cardId !== tCard)
                  .map((l) => (
                    <option key={l.cardId} value={l.cardId}>
                      {l.cardName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label>金额</label>
              <input type="number" step="0.01" value={tAmt} onChange={(e) => setTAmt(e.target.value)} />
            </div>
            <button className="primary" onClick={doTransfer} disabled={!tCard || !tPeer || !tAmt || budgetTransfer.isPending}>
              提交调账
            </button>
          </div>

        </>
      )}
    </div>
  );
}
