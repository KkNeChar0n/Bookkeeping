import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cardsService } from '../services/cards.service';
import type { CardType } from './types';
import { txService } from '../services/transactions.service';
import { comparisonService } from '../services/comparison.service';
import { summaryService } from '../services/summary.service';
import { cardViewService } from '../services/cardview.service';
import { budgetPlanService } from '../services/budgetPlan.service';
import { savingsActualService } from '../services/savingsActual.service';
import { savingsEntryService } from '../services/savingsEntry.service';
import { savingsLogService } from '../services/savingsLog.service';
import { consumptionBudgetService } from '../services/consumptionBudget.service';
import { savingsSummaryService } from '../services/savingsSummary.service';
import { spendService } from '../services/spend.service';
import { spendStatsService } from '../services/spendStats.service';
import { reconciliationService } from '../services/reconciliation.service';
import { incomeCompareService } from '../services/incomeCompare.service';
import { categoriesService } from '../services/categories';

// ---- 失效所有受余额影响的视图 ----
function useInvalidateLedger() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['cards'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['budgets'] });
    qc.invalidateQueries({ queryKey: ['comparison'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['cardviews'] });
    qc.invalidateQueries({ queryKey: ['budgetPlan'] });
    qc.invalidateQueries({ queryKey: ['savings'] });
    qc.invalidateQueries({ queryKey: ['spend'] });
    qc.invalidateQueries({ queryKey: ['consumptionBudget'] });
    qc.invalidateQueries({ queryKey: ['reconciliation'] });
    qc.invalidateQueries({ queryKey: ['incomeCompare'] });
  };
}

// ---- Cards ----
export function useCards() {
  return useQuery({ queryKey: ['cards'], queryFn: () => cardsService.list() });
}
export function useCreateCard() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      name: string;
      type?: CardType;
      initialBalance?: string;
      isDefault?: boolean;
    }) => cardsService.create(body),
    onSuccess: inv,
  });
}
export function useUpdateCard() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      type?: CardType;
      initialBalance?: string;
    }) => cardsService.update(id, body),
    onSuccess: inv,
  });
}
export function useDeleteCard() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => cardsService.remove(id), onSuccess: inv });
}
export function useSetDefaultCard() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => cardsService.setDefault(id), onSuccess: inv });
}
export function useReorderCards() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (orderedIds: string[]) => cardsService.reorder(orderedIds),
    onSuccess: inv,
  });
}

// ---- Categories ----
export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => categoriesService.get() });
}
export function useCategoryList() {
  return useQuery({ queryKey: ['categories', 'all'], queryFn: () => categoriesService.listAll() });
}
export function useAddCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: 'income' | 'expense'; name: string }) => categoriesService.add(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}
export function useRenameCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => categoriesService.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}
export function useRemoveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ---- Transactions ----
export function useTransactions(filter: { cardId?: string; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['transactions', filter],
    queryFn: () => txService.list(filter),
  });
}
export function useCreateEntry() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      cardId: string;
      type: 'IN' | 'OUT';
      amount: string;
      date?: string;
      category?: string;
      note?: string;
    }) => txService.createEntry(body),
    onSuccess: inv,
  });
}
export function useTransfer() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      cardId: string;
      direction: 'OUT' | 'IN';
      peerCardId: string;
      amount: string;
      date?: string;
      note?: string;
    }) => txService.transfer(body),
    onSuccess: inv,
  });
}
export function useSetBalance() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; targetBalance: string; date?: string; note?: string }) =>
      txService.setActualBalance(body),
    onSuccess: inv,
  });
}
export function useDeleteTransaction() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => txService.remove(id), onSuccess: inv });
}
export function useUpdateTransaction() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      amount?: string;
      category?: string;
      note?: string;
      date?: string;
    }) => txService.update(id, body),
    onSuccess: inv,
  });
}

// ---- Card views (类型化摘要，随日期变化) ----
export function useCardViews(date?: string) {
  return useQuery({
    queryKey: ['cardviews', date ?? 'today'],
    queryFn: () => cardViewService.list(date),
  });
}

// ---- 储蓄卡预算细节（按月） ----
export function useBudgetMonths(cardId: string, extraMonths: string[] = []) {
  return useQuery({
    queryKey: ['budgetPlan', cardId, extraMonths],
    queryFn: () => budgetPlanService.months(cardId, extraMonths),
    enabled: !!cardId,
  });
}
export function useAddBudgetDetail() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      cardId: string;
      month: string;
      label: string;
      category?: string;
      kind: 'IN' | 'OUT' | 'EXPENSE' | 'TRANSFER_IN';
      amount: string;
    }) => budgetPlanService.addDetail(body),
    onSuccess: inv,
  });
}
export function useBudgetTransfer() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; peerCardId: string; month: string; amount: string; note?: string }) =>
      budgetPlanService.transfer(body),
    onSuccess: inv,
  });
}
export function useDeleteBudgetDetail() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => budgetPlanService.deleteDetail(id), onSuccess: inv });
}
export function useBudgetCurrentMonth(cardId: string, month: string) {
  return useQuery({
    queryKey: ['budgetPlan', 'current', cardId, month],
    queryFn: () => budgetPlanService.currentMonthView(cardId, month),
    enabled: !!cardId,
  });
}

// ---- 每月真实储蓄额 ----
export function useSavingsList(cardId: string) {
  return useQuery({
    queryKey: ['savings', cardId],
    queryFn: () => savingsActualService.list(cardId),
    enabled: !!cardId,
  });
}
export function useSetSavingsAmount() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; month: string; amount: string }) =>
      savingsActualService.setAmount(body),
    onSuccess: inv,
  });
}

// ---- 储蓄卡多笔条目（收入 / 超额支出） ----
export function useSavingsEntries(cardId: string, month: string) {
  return useQuery({
    queryKey: ['savings', 'entries', cardId, month],
    queryFn: () => savingsEntryService.list(cardId, month),
    enabled: !!cardId,
  });
}
export function useAddSavingsEntry() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      cardId: string;
      month: string;
      kind: 'INCOME' | 'EXCESS';
      amount: string;
      note?: string;
    }) => savingsEntryService.add(body),
    onSuccess: inv,
  });
}
export function useRemoveSavingsEntry() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => savingsEntryService.remove(id), onSuccess: inv });
}
export function useSetSavingsEntry() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; month: string; kind: 'INCOME' | 'EXCESS'; amount: string }) =>
      savingsEntryService.setEntry(body),
    onSuccess: inv,
  });
}
// ---- 本月消费预算（储蓄卡→消费卡） ----
export function useConsumptionBudgets(savingsCardId: string, month: string) {
  return useQuery({
    queryKey: ['consumptionBudget', savingsCardId, month],
    queryFn: () => consumptionBudgetService.list(savingsCardId, month),
    enabled: !!savingsCardId,
  });
}
export function useBufferBefore(month: string) {
  return useQuery({
    queryKey: ['consumptionBudget', 'bufferBefore', month],
    queryFn: () => consumptionBudgetService.bufferBefore(month),
  });
}
export function useSetConsumptionBudget() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { savingsCardId: string; consumptionCardId: string; month: string; amount: string }) =>
      consumptionBudgetService.setBudget(body),
    onSuccess: inv,
  });
}

export function useSavingsLogs(cardId: string, month: string) {
  return useQuery({
    queryKey: ['savings', 'logs', cardId, month],
    queryFn: () => savingsLogService.list(cardId, month),
    enabled: !!cardId,
  });
}
export function useAddSavingsLog() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; month: string; field: 'AMOUNT' | 'INCOME' | 'EXCESS'; amount: string }) =>
      savingsLogService.add(body),
    onSuccess: inv,
  });
}
export function useRemoveSavings() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => savingsActualService.remove(id), onSuccess: inv });
}
export function useSavingsSummary() {
  return useQuery({ queryKey: ['savings', 'summary'], queryFn: () => savingsSummaryService.list() });
}
export function useSavingsSummaryAsOf(refMonth: string) {
  return useQuery({
    queryKey: ['savings', 'summary', refMonth],
    queryFn: () => savingsSummaryService.listAsOf(refMonth),
  });
}

// ---- 消费卡按月额度 ----
export function useSpendMonth(month: string) {
  return useQuery({ queryKey: ['spend', 'month', month], queryFn: () => spendService.listForMonth(month) });
}
export function useSpendCardMonth(cardId: string, month: string) {
  return useQuery({
    queryKey: ['spend', 'card', cardId, month],
    queryFn: () => spendService.monthView(cardId, month),
    enabled: !!cardId,
  });
}
export function useSpendPeriod(prefix: string) {
  return useQuery({ queryKey: ['spend', 'period', prefix], queryFn: () => spendService.periodView(prefix) });
}
export function useSetQuota() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { cardId: string; month: string; amount: string }) =>
      spendService.setQuota(body),
    onSuccess: inv,
  });
}

// ---- 基金：直填本金/市值 ----
export function useSetFund() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; principal?: string; value?: string }) =>
      cardsService.setFund(id, body),
    onSuccess: inv,
  });
}

// ---- 消费分类统计 ----
export function useSpendStats(prefix: string) {
  return useQuery({ queryKey: ['spend', 'stats', prefix], queryFn: () => spendStatsService.byCategory(prefix) });
}

// ---- 收入对比 ----
export function useIncomeCompare(prefix: string) {
  return useQuery({ queryKey: ['incomeCompare', prefix], queryFn: () => incomeCompareService.compute(prefix) });
}

// ---- 对账 ----
export function useReconciliation(refMonth: string) {
  return useQuery({
    queryKey: ['reconciliation', refMonth],
    queryFn: () => reconciliationService.compute(refMonth),
  });
}

// ---- Comparison / Summary ----
export function useComparison(date?: string) {
  return useQuery({
    queryKey: ['comparison', date ?? 'today'],
    queryFn: () => comparisonService.compare(date),
  });
}
export function useSummary(month?: string) {
  return useQuery({
    queryKey: ['summary', month ?? 'current'],
    queryFn: () => summaryService.monthly(month),
  });
}
