import {
  personListResponseSchema,
  personSchema,
  type CreatePersonInput,
  type Person,
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
