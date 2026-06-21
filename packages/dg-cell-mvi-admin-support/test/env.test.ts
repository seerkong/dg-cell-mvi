import { describe, it, expect, afterEach, vi } from 'vitest';

import { getEnv, getApiBase, getAppTitle, getStorageNamespace } from '../src/utils/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('utils/env', () => {
  it('returns sensible defaults when VITE_APP_* vars are unset', () => {
    // (vitest leaves VITE_APP_API etc. unset by default in this package)
    expect(getApiBase()).toBe('/api');
    expect(getAppTitle()).toBe('Admin');
    expect(getStorageNamespace()).toBe('admin');
    expect(getEnv('NOT_SET', 'fallback')).toBe('fallback');
  });

  it('reads injected VITE_APP_* values from import.meta.env', () => {
    vi.stubEnv('VITE_APP_API', 'https://prod.example.com/api');
    vi.stubEnv('VITE_APP_TITLE', 'My Console');
    vi.stubEnv('VITE_APP_STORAGE', 'myapp');

    expect(getApiBase()).toBe('https://prod.example.com/api');
    expect(getAppTitle()).toBe('My Console');
    expect(getStorageNamespace()).toBe('myapp');
    expect(getEnv('API', '/fallback')).toBe('https://prod.example.com/api');
  });
});
