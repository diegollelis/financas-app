import type { RefObject } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { CreateWorkspaceForm } from './create-workspace-form';

/**
 * "Novo espaço compartilhado": opened from the workspace switcher and from the personal
 * workspace's Membros page. Once created, the new workspace's dashboard opens.
 */
export function NewWorkspaceDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title="Novo espaço compartilhado"
      description="Para dividir as finanças com outras pessoas. Depois de criar, convide-as em Membros."
    >
      <CreateWorkspaceForm
        onCreated={(workspace) => {
          onOpenChange(false);
          toast.success('Espaço criado');
          void navigate(`/espacos/${workspace.id}/painel`);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
