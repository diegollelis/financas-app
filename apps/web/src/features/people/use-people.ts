import {
  personListResponseSchema,
  personSettlementDraftSchema,
  personSettlementSchema,
  personSchema,
  transactionListResponseSchema,
  type CreatePersonInput,
  type Person,
  type SettlePersonInput,
  type UpdatePersonInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'people'] (ADR 0042): their pending totals change with the transactions. */
export const peopleKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'people'] as const;

export function usePeople(workspaceId: string) {
  return useQuery({
    queryKey: peopleKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/people`, personListResponseSchema),
  });
}

export function useCreatePerson(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePersonInput) =>
      apiPost(`/api/workspaces/${workspaceId}/people`, input, personSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKey(workspaceId) }),
  });
}

export function useUpdatePerson(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePersonInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/people/${id}`, input, personSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKey(workspaceId) }),
  });
}

export function useDeletePerson(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/people/${personId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKey(workspaceId) }),
  });
}

/** The person of that name, ignoring case and spaces around it; undefined when there is none. */
export function findPerson(people: Person[], name: string): Person | undefined {
  const wanted = name.trim().toLocaleLowerCase('pt-BR');
  return people.find((person) => person.name.toLocaleLowerCase('pt-BR') === wanted);
}

/**
 * The id of the person typed in a transaction's "Pessoa" field (ADR 0042): someone already
 * listed (reactivated if archived), or a new one created now; null when the field is empty.
 */
export function useResolvePerson(workspaceId: string, people: Person[]) {
  const create = useCreatePerson(workspaceId);
  const update = useUpdatePerson(workspaceId);
  const resolve = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    const existing = findPerson(people, name);
    if (!existing) return (await create.mutateAsync({ name: name.trim() })).id;
    if (existing.archived) await update.mutateAsync({ id: existing.id, archived: false });
    return existing.id;
  };
  return {
    resolve,
    error: create.error ?? update.error,
    isPending: create.isPending || update.isPending,
  };
}

/** Everything linked to one person, of any competência, newest first (ADR 0042). */
export function usePersonTransactions(workspaceId: string, personId: string | null) {
  return useQuery({
    queryKey: [...peopleKey(workspaceId), personId, 'transactions'],
    queryFn: () =>
      apiGet(
        `/api/workspaces/${workspaceId}/people/${personId}/transactions`,
        transactionListResponseSchema,
      ),
    enabled: personId !== null,
  });
}

/**
 * What may go into a settlement with this person (ADR 0065): their pending debits and credits and
 * the reward category suggested. Fresh on each opening: it is the moment of paying.
 */
export function useSettlementDraft(workspaceId: string, personId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...peopleKey(workspaceId), personId, 'settlement'],
    queryFn: () =>
      apiGet(
        `/api/workspaces/${workspaceId}/people/${personId}/settlement`,
        personSettlementDraftSchema,
      ),
    enabled,
    staleTime: 0,
  });
}

/**
 * Settles with the person, or undoes it. Either touches transactions of many months, the totals
 * of people, the dashboard and the closings: every query of the workspace is refreshed, as after
 * paying a card's bill.
 */
export function useSettlePerson(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, ...input }: SettlePersonInput & { personId: string }) =>
      apiPost(
        `/api/workspaces/${workspaceId}/people/${personId}/settlements`,
        input,
        personSettlementSchema,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] }),
  });
}

export function useUndoSettlement(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, settlementId }: { personId: string; settlementId: string }) =>
      apiDelete(`/api/workspaces/${workspaceId}/people/${personId}/settlements/${settlementId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] }),
  });
}
