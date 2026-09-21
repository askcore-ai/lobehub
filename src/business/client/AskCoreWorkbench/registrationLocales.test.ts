// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import defaultAuth from '@/locales/default/auth';
import { locales } from '@/locales/resources';

const registrationKeys = (Object.keys(defaultAuth) as (keyof typeof defaultAuth)[])
  .filter((key) => key.startsWith('registration.'))
  .sort();
const placeholders = (value: string) =>
  [...value.matchAll(/\{\{[^{}]+\}\}/g)].map(([token]) => token).sort();

describe('registration translations in actual supported locale resources', () => {
  it.each(locales)('%s has complete messages and renders the current account', async (locale) => {
    const auth: Record<string, string> = JSON.parse(
      readFileSync(path.join(process.cwd(), 'locales', locale, 'auth.json'), 'utf8'),
    );
    expect(registrationKeys).toHaveLength(21);
    expect(
      Object.keys(auth)
        .filter((key) => key.startsWith('registration.'))
        .sort(),
    ).toEqual(registrationKeys);

    const i18n = createInstance();
    await i18n.init({
      defaultNS: 'auth',
      fallbackLng: false,
      interpolation: { escapeValue: false },
      keySeparator: false,
      lng: locale,
      ns: ['auth'],
      resources: { [locale]: { auth } },
    });

    const translate = i18n.getFixedT(locale, 'auth');
    const email = 'locale-check@example.invalid';
    for (const key of registrationKeys) {
      const value = auth[key];
      expect(typeof value, `${locale}:${key}`).toBe('string');
      expect(value.trim(), `${locale}:${key}`).not.toBe('');
      expect(placeholders(value), `${locale}:${key}`).toEqual(placeholders(defaultAuth[key]));
      const rendered = translate(key, { email });
      expect(rendered, `${locale}:${key}`).not.toBe(key);
      expect(rendered, `${locale}:${key}`).toBe(value.replaceAll('{{email}}', email));
    }
    expect(translate('registration.account.label', { email })).toContain(email);
  });
});
