import { describe, expect, it } from 'vitest';

import {
  EMPTY_LOOKUPS,
  filtersFromFormState,
  fromFormState,
  hydrateLookupLabels,
  mergeResourceItems,
  resolveLookupLabel,
  toFormState,
} from './resourceMeta';

describe('AskCore workbench resource metadata', () => {
  it('hydrates relation ids into display names', () => {
    const lookups = {
      ...EMPTY_LOOKUPS,
      classes: [{ class_id: 2, name: '高一 2 班' }],
      subjects: [{ name: '数学', subject_id: 7 }],
      teachers: [{ real_name: '张老师', teacher_id: 5 }],
    };

    expect(resolveLookupLabel(lookups, 'subjects', 7)).toBe('数学');
    expect(
      hydrateLookupLabels(
        { class_id: 2, subject_id: 7, teacher_id: 5 },
        lookups,
      ),
    ).toMatchObject({
      class_name: '高一 2 班',
      subject_name: '数学',
      teacher_name: '张老师',
    });
  });

  it('converts form state using plugin UI field semantics', () => {
    const form = toFormState('subjects', {
      is_core_subject: true,
      name: '数学',
      subject_category: 'core',
    });

    expect(form.is_core_subject).toBe('true');
    expect(fromFormState('subjects', form)).toEqual({
      is_core_subject: true,
      name: '数学',
      subject_category: 'core',
    });
  });

  it('builds numeric filters for lookup fields', () => {
    expect(filtersFromFormState('assignments', { grade_id: '3', query: '期中' })).toEqual({
      grade_id: 3,
      query: '期中',
    });
  });

  it('deduplicates cursor-loaded resource items by resource id', () => {
    expect(
      mergeResourceItems(
        'submissions',
        [{ submission_id: 1 }, { submission_id: 2 }],
        [{ submission_id: 2 }, { submission_id: 3 }],
      ),
    ).toEqual([{ submission_id: 1 }, { submission_id: 2 }, { submission_id: 3 }]);
  });
});
