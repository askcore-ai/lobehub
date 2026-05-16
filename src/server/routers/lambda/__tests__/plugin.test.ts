import { describe, expect, it, vi } from 'vitest';

import { PluginModel } from '@/database/models/plugin';

import { pluginRouter } from '../plugin';

vi.mock('@/database/models/plugin');

describe('pluginRouter', () => {
  const mockCtx = {
    serverDB: {} as any,
    userId: 'test-user',
  };

  it('refreshes MCP connection params when reinstalling an existing plugin', async () => {
    const mockFindById = vi.fn().mockResolvedValue({
      identifier: 'documents',
    });
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(PluginModel).mockImplementation(
      () =>
        ({
          findById: mockFindById,
          update: mockUpdate,
        }) as any,
    );

    const caller = pluginRouter.createCaller(mockCtx);

    await caller.createOrInstallPlugin({
      customParams: {
        mcp: {
          auth: { type: 'none' },
          cloudEndPoint: true,
          type: 'cloud',
        },
      },
      identifier: 'documents',
      manifest: {
        identifier: 'documents',
        type: 'mcp',
      },
      settings: {},
      source: 'builtin',
      type: 'plugin',
    });

    expect(mockUpdate).toHaveBeenCalledWith('documents', {
      customParams: {
        mcp: {
          auth: { type: 'none' },
          cloudEndPoint: true,
          type: 'cloud',
        },
      },
      manifest: {
        identifier: 'documents',
        type: 'mcp',
      },
      settings: {},
      source: 'builtin',
      type: 'plugin',
    });
  });
});
