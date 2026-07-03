import 'fake-indexeddb/auto';
import { db, newId, nowTs } from './src/db/db';
import { savingsActualService } from './src/services/savingsActual.service';
import { reconciliationService } from './src/services/reconciliation.service';

const S = newId();
await db.cards.add({ id: S, name: '招商', type: 'SAVINGS', initialBalance: 10000000, isDefault: true, sortOrder: 0, createdAt: nowTs() } as any);
// 预算：一笔 6300 房租（EXPENSE）
await db.budgetDetails.add({ id: newId(), cardId: S, month: '2026-07', label: '房租', kind: 'EXPENSE', amount: 630000, createdAt: nowTs() } as any);

// 情形A：实际也扣了 6300（付了房租）→ 100000-6300=93700
await savingsActualService.setAmount({ cardId: S, month: '2026-07', amount: '93700' });
let r = await reconciliationService.compute('2026-07');
console.log(`A 付了房租(实际93700): 预算总资产=${r.budgetTotal} 实际=${r.actualTotal} 差额=${r.diff} 利息=${r.interest}`);
console.log('  期望: 差额=0 利息=0（房租两边抵消）');

// 情形B：实际没扣（还没付/别处付）→ 100000
await savingsActualService.setAmount({ cardId: S, month: '2026-07', amount: '100000' });
r = await reconciliationService.compute('2026-07');
console.log(`\nB 没扣房租(实际100000): 预算总资产=${r.budgetTotal} 实际=${r.actualTotal} 差额=${r.diff} 利息=${r.interest}`);
console.log('  这种情况差额/利息=+6300（预算扣了但实际没扣）');
