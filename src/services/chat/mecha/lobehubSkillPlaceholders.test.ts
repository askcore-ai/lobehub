import { builtinSkills } from '@lobechat/builtin-skills';
import { describe, expect, it } from 'vitest';

describe('AskCore builtin skills', () => {
  it('does not ship the upstream LobeHub builtin connector', () => {
    expect(builtinSkills.some((s) => s.identifier === 'lobehub')).toBe(false);
  });
});
