import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewMode } from './view-mode';

describe('useViewMode', () => {
  it('starts as the list and remembers the table in this browser', () => {
    const { result } = renderHook(() => useViewMode('lancamentos'));
    expect(result.current[0]).toBe('LIST');

    act(() => result.current[1]('TABLE'));

    expect(result.current[0]).toBe('TABLE');
    expect(window.localStorage.getItem('financas:visao:lancamentos')).toBe('TABLE');
  });

  it('still switches while the page is open when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    const { result } = renderHook(() => useViewMode('recorrencias'));
    expect(result.current[0]).toBe('LIST');

    act(() => result.current[1]('TABLE'));

    expect(result.current[0]).toBe('TABLE');
    vi.restoreAllMocks();
  });
});
