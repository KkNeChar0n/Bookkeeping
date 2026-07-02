import { db, newId, nowTs, type CategoryRow } from '../db/db';
import type { Categories } from '../api/types';

const DEFAULTS: { kind: 'income' | 'expense'; name: string }[] = [
  { kind: 'income', name: '工资' },
  { kind: 'income', name: '报销' },
  { kind: 'income', name: '利息' },
  { kind: 'income', name: '投资收益' },
  { kind: 'income', name: '其他' },
  { kind: 'expense', name: '餐饮' },
  { kind: 'expense', name: '房租' },
  { kind: 'expense', name: '交通' },
  { kind: 'expense', name: '购物' },
  { kind: 'expense', name: '医疗' },
  { kind: 'expense', name: '其他' },
];

async function ensureSeeded(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;
  const base = nowTs();
  await db.categories.bulkAdd(
    DEFAULTS.map((d, i) => ({ id: newId(), kind: d.kind, name: d.name, sortOrder: i, createdAt: base + i })),
  );
}

async function all(): Promise<CategoryRow[]> {
  await ensureSeeded();
  const rows = await db.categories.toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export const categoriesService = {
  /** 供选择用：{income:[名称], expense:[名称]} */
  async get(): Promise<Categories> {
    const rows = await all();
    return {
      income: rows.filter((r) => r.kind === 'income').map((r) => r.name),
      expense: rows.filter((r) => r.kind === 'expense').map((r) => r.name),
    };
  },

  /** 供设置页管理用（含 id） */
  async listAll(): Promise<CategoryRow[]> {
    return all();
  },

  async add(input: { kind: 'income' | 'expense'; name: string }): Promise<void> {
    const name = input.name.trim();
    if (!name) throw new Error('名称不能为空');
    const rows = await db.categories.toArray();
    const sortOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
    await db.categories.add({ id: newId(), kind: input.kind, name, sortOrder, createdAt: nowTs() });
  },

  async rename(id: string, name: string): Promise<void> {
    const n = name.trim();
    if (!n) throw new Error('名称不能为空');
    await db.categories.update(id, { name: n });
  },

  async remove(id: string): Promise<void> {
    await db.categories.delete(id);
  },
};
