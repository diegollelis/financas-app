import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import {
  applyTheme,
  readThemePreference,
  setThemePreference,
  THEME_STORAGE_KEY,
  useTheme,
} from './theme';

const root = document.documentElement;

describe('theme', () => {
  it('follows the device by default', () => {
    stubPrefersDark(true);

    expect(readThemePreference()).toBe('system');
    expect(applyTheme('system')).toBe('dark');
    expect(root).toHaveClass('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('lets light and dark override the device', () => {
    stubPrefersDark(true);

    expect(applyTheme('light')).toBe('light');
    expect(root).not.toHaveClass('dark');
    expect(applyTheme('dark')).toBe('dark');
    expect(root).toHaveClass('dark');
  });

  it('saves the choice in this browser and reads it back', () => {
    setThemePreference('dark');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('falls back to the device when storage is blocked or holds something else', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
    vi.restoreAllMocks();
  });

  it('changes with the device while on "system"', () => {
    const device = stubPrefersDark(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');

    act(() => device.change(true));

    expect(result.current.resolved).toBe('dark');
    expect(root).toHaveClass('dark');
  });
});
