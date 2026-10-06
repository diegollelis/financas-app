import { CircleUser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { useSignOut } from '@/features/auth/use-auth-mutations';
import { useCurrentUser } from '@/features/auth/use-me';
import { useTheme, type ThemePreference } from '@/lib/theme';

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

function isThemePreference(value: string): value is ThemePreference {
  return themeOptions.some((option) => option.value === value);
}

/** Who is signed in, the theme and sign-out. (Workspaces are switched in the header.) */
export function AccountMenu({ signOut }: { signOut: ReturnType<typeof useSignOut> }) {
  const user = useCurrentUser();
  const theme = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu da conta">
          <CircleUser aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid font-normal">
          <span className="text-foreground truncate font-medium">{user.name}</span>
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme.preference}
            onValueChange={(value) => {
              if (isThemePreference(value)) theme.setPreference(value);
            }}
          >
            {themeOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
