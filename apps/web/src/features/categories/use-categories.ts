import {
  categoryListResponseSchema,
  categorySchema,
  copyCategoriesResultSchema,
  type CopyCategoriesInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** Under ['workspaces', id, ...], like everything else of one workspace. */
const categoriesKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'categories'] as const;

/** All categories of the workspace, archived too: credits first, then debits, by name. */
export function useCategories(workspaceId: string) {
  return useQuery({
    queryKey: categoriesKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/categories`, categoryListResponseSchema),
  });
}

/** After any change the list is fetched again: the API decides the order. */
function useInvalidateCategories(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: categoriesKey(workspaceId) });
}

export function useCreateCategory(workspaceId: string) {
  const onSuccess = useInvalidateCategories(workspaceId);
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiPost(`/api/workspaces/${workspaceId}/categories`, input, categorySchema),
    onSuccess,
  });
}

/** Copies categories of another of the person's workspaces into this one (ADR 0048). */
export function useCopyCategories(workspaceId: string) {
  const onSuccess = useInvalidateCategories(workspaceId);
  return useMutation({
    mutationFn: (input: CopyCategoriesInput) =>
      apiPost(`/api/workspaces/${workspaceId}/categories/copy`, input, copyCategoriesResultSchema),
    onSuccess,
  });
}

export function useUpdateCategory(workspaceId: string) {
  const onSuccess = useInvalidateCategories(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCategoryInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/categories/${id}`, input, categorySchema),
    onSuccess,
  });
}

export function useDeleteCategory(workspaceId: string) {
  const onSuccess = useInvalidateCategories(workspaceId);
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/categories/${categoryId}`),
    onSuccess,
  });
}
