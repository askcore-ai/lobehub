// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { defineConfig } from './define-config';

describe('Next.js config wrapper', () => {
  it('preserves the supplied static page generation timeout', () => {
    const config = defineConfig({ staticPageGenerationTimeout: 180 });

    expect(config.staticPageGenerationTimeout).toBe(180);
  });
});
