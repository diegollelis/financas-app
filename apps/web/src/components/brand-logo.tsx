import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * The app's mark inside the app (ADR 0044): the official CL symbol and the product name as
 * text, large enough to read on any screen. Every CodeLélis app signs the same way ([CL] Agenda,
 * [CL] Estudos…); the full artwork stays at the entrance (the auth pages). A link to "/", which
 * opens the last workspace.
 */
export function AppBrand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 md:min-h-0',
        className,
      )}
    >
      <BrandLogo variant="symbol" alt="" className="h-7" />
      <span className="text-lg font-semibold tracking-tight">Finanças</span>
    </Link>
  );
}

type BrandFile = { src: string; width: number; height: number };

/**
 * The brand files of ADR 0043, derived from the approved artwork (never redrawn). The symbol
 * works on both themes; the horizontal logo has a version for each, since its lettering is
 * dark on light and white on navy. PNG only: the WebP versions came out no smaller.
 */
const files: Record<'symbol' | 'horizontal', { light: BrandFile; dark?: BrandFile }> = {
  symbol: { light: { src: '/brand/cl-symbol.png', width: 192, height: 133 } },
  horizontal: {
    light: { src: '/brand/logo-horizontal-light.png', width: 720, height: 160 },
    dark: { src: '/brand/logo-horizontal-dark.png', width: 720, height: 175 },
  },
};

/**
 * The CL symbol or the `<CodeLélis/> Finanças` logo. Size it by height in `className`
 * (`h-8 w-auto`). The theme comes from the `.dark` class, not from a media query, so the logo
 * with two versions renders both and CSS shows one. `alt` names the app where the logo is the
 * only name in sight; pass `alt=""` when a visible text already says it.
 */
export function BrandLogo({
  variant,
  className,
  alt = 'CodeLélis Finanças',
}: {
  variant: 'symbol' | 'horizontal';
  className?: string;
  alt?: string;
}) {
  const { light, dark } = files[variant];
  const image = (file: BrandFile, themeClass?: string) => (
    <img
      src={file.src}
      width={file.width}
      height={file.height}
      alt={alt}
      draggable={false}
      className={cn('w-auto shrink-0 select-none', themeClass, className)}
    />
  );
  if (!dark) return image(light);
  return (
    <>
      {image(light, 'dark:hidden')}
      {image(dark, 'hidden dark:block')}
    </>
  );
}
