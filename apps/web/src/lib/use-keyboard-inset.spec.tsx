import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { useKeyboardInset } from './use-keyboard-inset';

/**
 * A visual viewport like a phone's: 800px tall until the keyboard opens and covers `keyboard`
 * pixels at the bottom. jsdom has none.
 */
function stubVisualViewport() {
  const target = new EventTarget();
  const viewport = Object.assign(target, { height: 800, offsetTop: 0 });
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('visualViewport', viewport);
  return {
    keyboard(height: number) {
      viewport.height = 800 - height;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
    },
  };
}

describe('useKeyboardInset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures what the keyboard covers, and back to zero when it closes', () => {
    const phone = stubVisualViewport();
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toEqual({ inset: 0, visibleHeight: 800 });

    phone.keyboard(300);
    expect(result.current).toEqual({ inset: 300, visibleHeight: 500 });

    phone.keyboard(0);
    expect(result.current.inset).toBe(0);
  });

  it('is zero where there is no visual viewport', () => {
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current.inset).toBe(0);
  });

  it('lifts the phone sheet above the keyboard and fits it in what is left', () => {
    const phone = stubVisualViewport();
    render(
      <ResponsiveDialog
        open
        onOpenChange={() => undefined}
        title="Novo espaço compartilhado"
        description="Para dividir as finanças."
      >
        <input aria-label="Nome do espaço" />
      </ResponsiveDialog>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Novo espaço compartilhado' });
    expect(sheet.style.bottom).toBe('');

    phone.keyboard(300);

    expect(sheet.style.bottom).toBe('300px');
    expect(sheet.style.maxHeight).toBe('484px');
  });
});
