import { ACCOUNT_PATH } from '@financas/shared';
import { ChevronsUpDown, CircleUser } from 'lucide-react';
import { Link } from 'react-router';
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

/**
 * Who is signed in, their account page, the theme and sign-out. On the phone header, an icon;
 * at the foot of the desktop sidebar (ADR 0044), the person's name and e-mail, opening upward.
 */
export function AccountMenu({
  signOut,
  variant = 'icon',
}: {
  signOut: ReturnType<typeof useSignOut>;
  variant?: 'icon' | 'sidebar';
}) {
  const user = useCurrentUser();
  const theme = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button variant="ghost" size="icon" aria-label="Menu da conta">
            <CircleUser aria-hidden className="size-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="hover:bg-sidebar-accent h-auto w-full justify-start gap-3 px-3 py-2 text-left"
          >
            <CircleUser aria-hidden className="text-muted-foreground size-5" />
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {user.email}
              </span>
            </span>
            <ChevronsUpDown aria-hidden className="text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'icon' ? 'end' : 'start'}
        side={variant === 'icon' ? 'bottom' : 'top'}
        className="w-64"
      >
        <DropdownMenuLabel className="grid font-normal">
          <span className="text-foreground truncate font-medium">{user.name}</span>
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={ACCOUNT_PATH}>Minha conta</Link>
        </DropdownMenuItem>
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
