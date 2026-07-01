import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cardsService } from '../services/cards.service';
import type { CardType } from './types';
import { budgetsService } from '../services/budgets.service';
import { txService } from '../services/transactions.service';
import { comparisonService } from '../services/comparison.service';
import { summaryService } from '../services/summary.service';
import { cardViewService } from '../services/cardview.service';
import { budgetPlanService } from '../services/budgetPlan.service';
import { savingsActualService } from '../services/savingsActual.service';
import { savingsSummaryService } from '../services/savingsSummary.service';
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
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.get(),
    staleTime: Infinity,
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

// ---- Budgets ----
export function useBudgets() {
  return useQuery({ queryKey: ['budgets'], queryFn: () => budgetsService.list() });
}
export function useCreateSnapshot() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { date: string; note?: string }) => budgetsService.upsertSnapshot(body),
    onSuccess: inv,
  });
}
export function useSetBudgetLine() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      snapshotId: string;
      cardId: string;
      inAmount?: string;
      outAmount?: string;
    }) => budgetsService.setLine(body),
    onSuccess: inv,
  });
}
export function useBudgetTransfer() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: {
      snapshotId: string;
      cardId: string;
      direction: 'OUT' | 'IN';
      peerCardId: string;
      amount: string;
    }) => budgetsService.transfer(body),
    onSuccess: inv,
  });
}
export function useDeleteSnapshot() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => budgetsService.remove(id), onSuccess: inv });
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
      kind: 'IN' | 'OUT';
      amount: string;
    }) => budgetPlanService.addDetail(body),
    onSuccess: inv,
  });
}
export function useDeleteBudgetDetail() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => budgetPlanService.deleteDetail(id), onSuccess: inv });
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
export function useRemoveSavings() {
  const inv = useInvalidateLedger();
  return useMutation({ mutationFn: (id: string) => savingsActualService.remove(id), onSuccess: inv });
}
export function useSavingsSummary() {
  return useQuery({ queryKey: ['savings', 'summary'], queryFn: () => savingsSummaryService.list() });
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
