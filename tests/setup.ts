import '@testing-library/jest-dom';
// mock indexedDB to test with dexie
// refs: https://github.com/dumbmatter/fakeIndexedDB#dexie-and-other-indexeddb-api-wrappers
import 'fake-indexeddb/auto';

import { theme } from 'antd';
import i18n from 'i18next';
import { enableMapSet, enablePatches } from 'immer';
import React from 'react';
import { vi } from 'vitest';

import chat from '@/locales/default/chat';
import common from '@/locales/default/common';
import discover from '@/locales/default/discover';
import home from '@/locales/default/home';
import oauth from '@/locales/default/oauth';

// Enable Immer MapSet plugin so store code using Map/Set in produce() works in tests
enablePatches();
enableMapSet();

// Global mock for @lobehub/analytics/react to avoid AnalyticsProvider dependency
// This prevents tests from failing when components use useAnalytics hook
vi.mock('@lobehub/analytics/react', () => ({
  useAnalytics: () => ({
    analytics: {
      track: vi.fn(),
    },
  }),
}));

// Global mock for @/auth to avoid better-auth validator module issue in tests
// The validator package has ESM resolution issues in Vitest environment
vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

// node runtime
if (typeof globalThis.window === 'undefined') {
  // test with polyfill crypto
  const { Crypto } = await import('@peculiar/webcrypto');

  Object.defineProperty(globalThis, 'crypto', {
    value: new Crypto(),
    writable: true,
  });
}

const createMemoryStorage = () => {
  const store = new Map<string, string>();

  return {
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, String(value))),
    get length() {
      return store.size;
    },
  };
};

for (const storageKey of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[storageKey]?.getItem !== 'function') {
    Object.defineProperty(globalThis, storageKey, {
      configurable: true,
      value: createMemoryStorage(),
      writable: true,
    });
  }
}

// remove antd hash on test
theme.defaultConfig.hashed = false;

// init i18n for non-React modules (stores/utils) using i18next.t(...)
// Use in-memory resources to avoid interfering with Vitest module mocking.
await i18n.init({
  defaultNS: 'common',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  lng: 'zh-CN',
  ns: ['common', 'chat', 'discover', 'home', 'oauth'],
  resources: {
    'zh-CN': {
      chat,
      common,
      discover,
      home,
      oauth,
    },
  },
});

// 将 React 设置为全局变量，这样就不需要在每个测试文件中导入它了
(globalThis as any).React = React;
