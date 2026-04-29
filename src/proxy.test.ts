import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('proxy matcher', () => {
  it('routes AskCore workbench deep links through the SPA middleware', async () => {
    const source = await readFile(path.join(process.cwd(), 'src/proxy.ts'), 'utf8');

    expect(source).toContain("'/askcore'");
    expect(source).toContain("'/askcore(.*)'");
  });
});
