// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it, vi } from 'vitest';

import { defineConfig } from './define-config';

describe('Next.js config wrapper', () => {
  it('preserves the supplied static page generation timeout', () => {
    const config = defineConfig({ staticPageGenerationTimeout: 180 });

    expect(config.staticPageGenerationTimeout).toBe(180);
  });

  it('traces canvas wrappers and platform binaries without tracing package directories as files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'canvas-trace-'));
    const wrapper = 'node_modules/.pnpm/@napi-rs+canvas@0.1.100/node_modules/@napi-rs/canvas';
    const platform = 'node_modules/.pnpm/@napi-rs+canvas-linux-x64-gnu@0.1.100/node_modules/@napi-rs/canvas-linux-x64-gnu';
    const files = [`${wrapper}/index.js`, `${wrapper}/js-binding.js`, `${wrapper}/geometry.js`,
      `${wrapper}/package.json`, `${platform}/package.json`, `${platform}/skia.linux-x64-gnu.node`];
    try {
      for (const file of files) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), 'synthetic native package fixture');
      }
      symlinkSync(path.join(root, platform), path.join(root, wrapper, '../canvas-linux-x64-gnu'), 'dir');
      mkdirSync(path.join(root, 'node_modules/@napi-rs'), { recursive: true });
      symlinkSync(path.join(root, wrapper), path.join(root, 'node_modules/@napi-rs/canvas'), 'dir');
      symlinkSync(path.join(root, platform), path.join(root, 'node_modules/@napi-rs/canvas-linux-x64-gnu'), 'dir');
      vi.stubEnv('DOCKER', 'true');
      const config = defineConfig({});
      const patterns = config.outputFileTracingIncludes?.['*'] ?? [];
      const matched = globSync(patterns, { cwd: root, follow: true });
      expect(matched.filter((file) => statSync(path.join(root, file)).isDirectory())).toEqual([]);
      expect(matched).toEqual(expect.arrayContaining(files));
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { force: true, recursive: true });
    }
  });
});
