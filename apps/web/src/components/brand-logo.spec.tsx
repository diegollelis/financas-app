import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  it('names the app by default, in each theme version of the logo', () => {
    render(<BrandLogo variant="horizontal" />);
    const images = screen.getAllByRole('img', { name: 'CodeLélis Finanças' });
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/brand/logo-horizontal-light.png',
      '/brand/logo-horizontal-dark.png',
    ]);
    // CSS shows one: the light one in light, the dark one under .dark.
    expect(images[0]).toHaveClass('dark:hidden');
    expect(images[1]).toHaveClass('hidden', 'dark:block');
  });

  it('is decorative when a visible text already names the app', () => {
    render(<BrandLogo variant="symbol" alt="" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', '/brand/cl-symbol.png');
  });
});
