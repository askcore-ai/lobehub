// @vitest-environment node
import { PLUGINS_INDEX_URL } from '@lobechat/const';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appEnv } from '@/envs/app';

import { PluginStore } from './index';

describe('PluginStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return the default index URL when no language is provided', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl();
    expect(url).toBe(appEnv.PLUGINS_INDEX_URL);
  });

  it('should return the index URL for a supported language', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl('en-US');
    expect(url).toBe(appEnv.PLUGINS_INDEX_URL.replace('/index.json', '/index.en-US.json'));
  });

  it('should return the base URL if the provided language is not supported', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl('xx-XX' as any);
    expect(url).toBe(appEnv.PLUGINS_INDEX_URL);
  });

  it('should keep directory-style base URLs compatible with upstream plugin indexes', () => {
    const pluginStore = new PluginStore('https://example.com/plugins');
    const url = pluginStore.getPluginIndexUrl('zh-CN');
    expect(url).toBe('https://example.com/plugins/index.zh-CN.json');
  });

  it('should avoid compose-only plugin index hosts during production builds', () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const pluginStore = new PluginStore('http://api:8000/api/lobe/plugins/v1/market/index.json');
    const url = pluginStore.getPluginIndexUrl('zh-CN');

    expect(url).toBe(PLUGINS_INDEX_URL.replace('/index.json', '/index.zh-CN.json'));
  });
});
