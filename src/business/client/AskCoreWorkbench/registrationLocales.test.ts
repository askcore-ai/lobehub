// @vitest-environment node
import { createInstance } from 'i18next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import defaultAuth from '@/locales/default/auth';
import { locales } from '@/locales/resources';

const registrationEntries = Object.entries(defaultAuth).filter(([key]) =>
  key.startsWith('registration.'),
);
const registrationKeys = registrationEntries.map(([key]) => key).sort();
const placeholders = (value: string) =>
  [...value.matchAll(/{{[^{}]+}}/g)].map(([token]) => token).sort();

describe('registration translations in actual supported locale resources', () => {
  it.each(locales)('%s has complete messages and renders the current account', async (locale) => {
    const auth: Record<string, string> = JSON.parse(
      readFileSync(join(process.cwd(), 'locales', locale, 'auth.json'), 'utf8'),
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

    const email = 'locale-check@example.invalid';
    for (const [key, source] of registrationEntries) {
      const value = auth[key];
      expect(typeof value, `${locale}:${key}`).toBe('string');
      expect(value.trim(), `${locale}:${key}`).not.toBe('');
      expect(placeholders(value), `${locale}:${key}`).toEqual(placeholders(source));
      const rendered = i18n.t(key, { email });
      expect(rendered, `${locale}:${key}`).not.toBe(key);
      expect(rendered, `${locale}:${key}`).toBe(value.replaceAll('{{email}}', email));
    }
    expect(i18n.t('registration.account.label', { email })).toContain(email);
  });
});
