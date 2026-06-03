import { PLUGINS_INDEX_URL as DEFAULT_PLUGINS_INDEX_URL } from '@lobechat/const';
import urlJoin from 'url-join';

import { DEFAULT_LANG, isLocaleNotSupport } from '@/const/locale';
import { appEnv } from '@/envs/app';
import { type Locales } from '@/locales/resources';
import { normalizeLocale } from '@/locales/resources';

const COMPOSE_ONLY_HOSTS = new Set(['api']);

const isProductionBuild = () => process.env.NEXT_PHASE === 'phase-production-build';

const shouldUseBuildSafePluginIndex = (baseUrl: string) => {
  if (!isProductionBuild()) return false;

  try {
    return COMPOSE_ONLY_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
};

export class PluginStore {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const configuredBaseUrl = baseUrl || appEnv.PLUGINS_INDEX_URL;
    this.baseUrl = shouldUseBuildSafePluginIndex(configuredBaseUrl)
      ? DEFAULT_PLUGINS_INDEX_URL
      : configuredBaseUrl;
  }

  getPluginIndexUrl = (lang?: Locales) => {
    if (!lang) return this.baseUrl;
    if (isLocaleNotSupport(lang)) return this.baseUrl;

    const localizedIndex = `index.${normalizeLocale(lang)}.json`;

    return /\/index(?:\.[^/?#]+)?\.json$/.test(this.baseUrl)
      ? this.baseUrl.replace(/\/index(?:\.[^/?#]+)?\.json$/, `/${localizedIndex}`)
      : urlJoin(this.baseUrl, localizedIndex);
  };

  getPluginList = async (locale?: string): Promise<any[]> => {
    try {
      let res = await fetch(this.getPluginIndexUrl(locale as Locales), {
        next: {
          revalidate: 3600,
        },
      });
      if (!res.ok) {
        res = await fetch(this.getPluginIndexUrl(DEFAULT_LANG), {
          next: {
            revalidate: 3600,
          },
        });
      }
      if (!res.ok) return [];
      const json = await res.json();
      return json.plugins ?? [];
    } catch (e) {
      console.error('[getPluginListError] failed to fetch plugin list, error detail:');
      console.error(e);
      return [];
    }
  };
}
