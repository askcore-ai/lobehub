import { describe, expect, it } from 'vitest';

import { subscriptionRouter } from './subscription';

describe('AskCore subscription router', () => {
  it('keeps the official-style router empty so billing state is not fabricated locally', () => {
    expect(Object.keys(subscriptionRouter._def.procedures)).toEqual([]);
  });
});
