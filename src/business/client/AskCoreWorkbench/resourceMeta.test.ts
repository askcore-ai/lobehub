import { describe, expect, it } from 'vitest';

import {
  EMPTY_LOOKUPS,
  fieldOptions,
  filtersFromFormState,
  fromFormState,
  hydrateLookupLabels,
  isEditableResource,
  mergeResourceItems,
  resolveLookupLabel,
  RESOURCE_FILTER_FIELDS,
  RESOURCE_FORM_FIELDS,
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
      hydrateLookupLabels({ class_id: 2, subject_id: 7, teacher_id: 5 }, lookups),
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
    expect(filtersFromFormState('attempts', { activity_id: '8', status: 'graded' })).toEqual({
      activity_id: 8,
      status: 'graded',
    });
  });

  it('treats protocol activity and attempt resources as read-only UI resources', () => {
    expect(isEditableResource('activities')).toBe(false);
    expect(isEditableResource('attempts')).toBe(false);
    expect(isEditableResource('questions')).toBe(true);
    expect(RESOURCE_FILTER_FIELDS.activities).toEqual([
      { key: 'subject_id', kind: 'select', label: '科目', numeric: true, optionsFrom: 'subjects' },
      { key: 'grade_id', kind: 'select', label: '教学年级', numeric: true, optionsFrom: 'grades' },
    ]);
    expect(RESOURCE_FORM_FIELDS).not.toHaveProperty('activities');
    expect(RESOURCE_FORM_FIELDS).not.toHaveProperty('attempts');
  });

  it('uses org_unit_id as the student class membership field', () => {
    expect(RESOURCE_FILTER_FIELDS.students).toEqual([
      { key: 'org_unit_id', kind: 'select', label: '班级', numeric: true, optionsFrom: 'classes' },
    ]);
    expect(RESOURCE_FORM_FIELDS.students).toEqual(
      expect.arrayContaining([
        {
          key: 'org_unit_id',
          kind: 'select',
          label: '班级',
          numeric: true,
          optionsFrom: 'classes',
        },
      ]),
    );

    const lookups = {
      ...EMPTY_LOOKUPS,
      classes: [{ id: 10003, name: '高一 1 班', org_unit_id: 10003, unit_type: 'class' }],
    };
    const classField = RESOURCE_FORM_FIELDS.students.find((field) => field.key === 'org_unit_id');
    expect(classField).toBeTruthy();
    expect(fieldOptions(classField!, lookups)).toEqual([{ label: '高一 1 班', value: '10003' }]);
    expect(
      fromFormState('students', { name: '杨博宇', org_unit_id: '10003', student_number: '60' }),
    ).toEqual({
      name: '杨博宇',
      org_unit_id: 10003,
      student_number: '60',
    });
    expect(
      hydrateLookupLabels({ name: '杨博宇', org_unit_id: 10003, student_number: '60' }, lookups),
    ).toMatchObject({
      class_name: '高一 1 班',
    });
  });

  it('deduplicates cursor-loaded resource items by resource id', () => {
    expect(
      mergeResourceItems(
        'attempts',
        [{ attempt_id: 1 }, { attempt_id: 2 }],
        [{ attempt_id: 2 }, { attempt_id: 3 }],
      ),
    ).toEqual([{ attempt_id: 1 }, { attempt_id: 2 }, { attempt_id: 3 }]);
  });
});
