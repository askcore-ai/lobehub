import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  appendScientificDiagramGuidance,
  SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE,
} from './scientificDiagramGuidance';

describe('scientific guidance type boundary preserves the existing scope policy', () => {
  it.each(['main', 'thread', 'group', 'group_agent'])('appends only for %s', (scope) => {
    const result = appendScientificDiagramGuidance('Existing role', scope);
    expectTypeOf(result).toEqualTypeOf<string>();
    expect(result).toBe(`Existing role\n\n${SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE}`);
    expect(appendScientificDiagramGuidance(result, scope)).toBe(result);
    for (const role of ['', null, undefined]) {
      expect(appendScientificDiagramGuidance(role, scope)).toBe(SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE);
    }
  });

  it.each([undefined, null, '', 'page', 'task', 'agent_builder', 'group_agent_builder', 'sub_agent', 'future_scope'])(
    'preserves every existing role unchanged for denied scope %s',
    (scope) => {
      for (const role of ['Existing role', '', null, undefined]) {
        expect(appendScientificDiagramGuidance(role, scope)).toBe(role);
      }
      expectTypeOf(appendScientificDiagramGuidance('Existing role', scope)).toEqualTypeOf<string>();
      expectTypeOf(appendScientificDiagramGuidance(undefined, scope)).toEqualTypeOf<string | undefined>();
      expectTypeOf(appendScientificDiagramGuidance(null, scope)).toEqualTypeOf<string | null | undefined>();
    },
  );
});
