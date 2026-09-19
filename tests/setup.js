import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});
