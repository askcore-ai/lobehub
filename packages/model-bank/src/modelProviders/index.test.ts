import {
  ENABLE_BUSINESS_FEATURES,
  ENABLE_LOBEHUB_CLOUD_PROVIDER,
} from '@lobechat/business-const';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ModelProviderCard } from '@/types/llm';

import { LOBE_DEFAULT_MODEL_LIST } from '../aiModels';
import { DEFAULT_MODEL_PROVIDER_LIST, isProviderDisableBrowserRequest } from './index';

describe('isProviderDisableBrowserRequest', () => {
  const originalProviders = [...DEFAULT_MODEL_PROVIDER_LIST];

  const createProvider = (overrides: Partial<ModelProviderCard>): ModelProviderCard => ({
    chatModels: [],
    id: 'test-provider',
    name: 'Test Provider',
    settings: {},
    url: 'https://example.com',
    ...overrides,
  });

  beforeEach(() => {
    DEFAULT_MODEL_PROVIDER_LIST.length = 0;
    DEFAULT_MODEL_PROVIDER_LIST.push(
      createProvider({ id: 'root-disabled', disableBrowserRequest: true }),
      createProvider({ id: 'settings-disabled', settings: { disableBrowserRequest: true } }),
      createProvider({ id: 'enabled-provider' }),
    );
  });

  afterEach(() => {
    DEFAULT_MODEL_PROVIDER_LIST.length = 0;
    DEFAULT_MODEL_PROVIDER_LIST.push(...originalProviders);
  });

  it('returns true for providers with root-level disableBrowserRequest', () => {
    expect(isProviderDisableBrowserRequest('root-disabled')).toBe(true);
  });

  it('returns true for providers with settings.disableBrowserRequest', () => {
    expect(isProviderDisableBrowserRequest('settings-disabled')).toBe(true);
  });

  it('returns false for providers without disableBrowserRequest', () => {
    expect(isProviderDisableBrowserRequest('enabled-provider')).toBe(false);
  });

  it('returns false for unknown provider id', () => {
    expect(isProviderDisableBrowserRequest('not-exists')).toBe(false);
  });
});

describe('AskCore LobeHub Cloud provider exposure', () => {
  it('does not expose official LobeHub Cloud providers when AskCore business features are enabled', () => {
    expect(ENABLE_BUSINESS_FEATURES).toBe(true);
    expect(ENABLE_LOBEHUB_CLOUD_PROVIDER).toBe(false);
    expect(DEFAULT_MODEL_PROVIDER_LIST.some((provider) => provider.id === 'lobehub')).toBe(false);
    expect(LOBE_DEFAULT_MODEL_LIST.some((model) => model.providerId === 'lobehub')).toBe(false);
  });
});
