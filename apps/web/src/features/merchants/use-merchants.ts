import {
  merchantListResponseSchema,
  merchantSchema,
  normalizeName,
  type CreateMerchantInput,
  type Merchant,
  type UpdateMerchantInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'merchants'] (ADR 0053): `inUse` changes with the transactions. */
export const merchantsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'merchants'] as const;

export function useMerchants(workspaceId: string) {
  return useQuery({
    queryKey: merchantsKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/merchants`, merchantListResponseSchema),
  });
}

export function useCreateMerchant(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMerchantInput) =>
      apiPost(`/api/workspaces/${workspaceId}/merchants`, input, merchantSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: merchantsKey(workspaceId) }),
  });
}

export function useUpdateMerchant(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateMerchantInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/merchants/${id}`, input, merchantSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: merchantsKey(workspaceId) }),
  });
}

export function useDeleteMerchant(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (merchantId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/merchants/${merchantId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: merchantsKey(workspaceId) }),
  });
}

/** The merchant of that name, ignoring case and accents, as the API does; undefined if none. */
export function findMerchant(merchants: Merchant[], name: string): Merchant | undefined {
  const wanted = normalizeName(name);
  return merchants.find((merchant) => normalizeName(merchant.name) === wanted);
}

/**
 * The id of the merchant picked in a form (ADR 0053): one already listed (reactivated if
 * archived), or a new one created now; null when the field is empty.
 */
export function useResolveMerchant(workspaceId: string, merchants: Merchant[]) {
  const create = useCreateMerchant(workspaceId);
  const update = useUpdateMerchant(workspaceId);
  const resolve = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    const existing = findMerchant(merchants, name);
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
