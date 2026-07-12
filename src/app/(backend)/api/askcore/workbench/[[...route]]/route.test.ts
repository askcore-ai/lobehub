// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DELETE, GET, OPTIONS, PATCH, POST } from './route';

describe('retired AskCore school Workbench route', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
    ['OPTIONS', OPTIONS],
  ])('returns 410 for %s without forwarding a legacy request', async (_method, handler) => {
    const response = handler();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      code: 'askcore_school_workbench_retired',
      detail: 'This school Workbench API is retired. Use an LMS-native AskCore processing launch.',
    });
  });
});
