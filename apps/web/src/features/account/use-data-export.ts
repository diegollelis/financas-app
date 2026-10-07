import { todayIso } from '@financas/shared';
import { useMutation } from '@tanstack/react-query';
import { apiDownload } from '@/lib/api';
import { saveFile } from '@/lib/browser';

/** Downloads everything the app keeps about the person, as a JSON file (ADR 0041). */
export function useDataExport() {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await apiDownload(
        '/api/me/export',
        `financas-dados-${todayIso()}.json`,
      );
      saveFile(blob, filename);
    },
  });
}
