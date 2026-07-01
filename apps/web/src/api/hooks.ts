import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cardsService } from '../services/cards.service';
import { budgetsService } from '../services/budgets.service';
import { txService } from '../services/transactions.service';
import { comparisonService } from '../services/comparison.service';
import { summaryService } from '../services/summary.service';
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
  };
}

// ---- Cards ----
export function useCards() {
  return useQuery({ queryKey: ['cards'], queryFn: () => cardsService.list() });
}
export function useCreateCard() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { name: string; initialBalance?: string; isDefault?: boolean }) =>
      cardsService.create(body),
    onSuccess: inv,
  });
}
export function useUpdateCard() {
  const inv = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; initialBalance?: string }) =>
      cardsService.update(id, body),
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
