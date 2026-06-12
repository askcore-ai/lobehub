import { ENABLE_BUSINESS_FEATURES, ENABLE_LOBEHUB_CLOUD_PROVIDER } from '@lobechat/business-const';
import { LOBE_DEFAULT_MODEL_LIST } from 'model-bank';
import { DEFAULT_MODEL_PROVIDER_LIST } from 'model-bank/modelProviders';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_NEW_MODELS,
  NEW_CHAT_MODEL,
  NEW_CHAT_PROVIDER,
  NEW_MINIMAX_PROVIDER,
} from './starterModels';

describe('starter models', () => {
  it('uses the native provider unless LobeHub Cloud provider routing is enabled', () => {
    expect(NEW_CHAT_MODEL).toBe('gpt-5.5');
    expect(ENABLE_BUSINESS_FEATURES).toBe(true);
    expect(NEW_CHAT_PROVIDER).toBe(ENABLE_LOBEHUB_CLOUD_PROVIDER ? 'lobehub' : 'openai');
    expect(NEW_MINIMAX_PROVIDER).toBe(ENABLE_LOBEHUB_CLOUD_PROVIDER ? 'lobehub' : 'minimax');
  });

  it('keeps starter chat models routable through exposed providers and model bank entries', () => {
    const exposedProviderIds = new Set(DEFAULT_MODEL_PROVIDER_LIST.map((provider) => provider.id));

    for (const item of DEFAULT_HOME_NEW_MODELS.filter((item) => item.type === 'chat')) {
      expect(item.provider, `${item.title} must declare the runtime provider`).toBeTruthy();
      expect(
        exposedProviderIds.has(item.provider!),
        `${item.title} uses provider "${item.provider}", which is not exposed in this build`,
      ).toBe(true);
      expect(
        LOBE_DEFAULT_MODEL_LIST.some(
          (model) => model.providerId === item.provider && model.id === item.model,
        ),
        `${item.title} must exist as ${item.provider}/${item.model} in LOBE_DEFAULT_MODEL_LIST`,
      ).toBe(true);
      expect(
        item.provider === 'lobehub' ? ENABLE_LOBEHUB_CLOUD_PROVIDER : true,
        `${item.title} must not use lobehub provider unless LobeHub Cloud routing is enabled`,
      ).toBe(true);
    }
  });

  it('keeps the fallback home new model entries in the current product order', () => {
    const sharedItems = [
      {
        model: 'gpt-5.5',
        provider: NEW_CHAT_PROVIDER,
        title: 'GPT-5.5',
        type: 'chat',
      },
      {
        model: 'gpt-image-2',
        title: 'GPT Image 2',
        type: 'image',
      },
      {
        model: 'dreamina-seedance-2-0-260128',
        title: 'Seedance 2.0',
        type: 'video',
      },
    ];

    expect(DEFAULT_HOME_NEW_MODELS).toEqual(
      ENABLE_BUSINESS_FEATURES
        ? [
            {
              model: 'MiniMax-M3',
              provider: NEW_MINIMAX_PROVIDER,
              title: 'MiniMax M3',
              type: 'chat',
            },
            ...sharedItems,
          ]
        : sharedItems,
    );
  });
});
