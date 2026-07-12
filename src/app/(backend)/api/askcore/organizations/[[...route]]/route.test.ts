// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DELETE, GET, OPTIONS, PATCH, POST } from './route';

describe('retired AskCore school organization route', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
    ['OPTIONS', OPTIONS],
  ])(
    'returns 410 for %s without reading or mutating local organization state',
    async (_method, handler) => {
      const response = handler();

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({
        code: 'askcore_school_organization_retired',
        detail: 'AskCore no longer manages school organizations. Use the connected SIS.',
      });
    },
  );
});
