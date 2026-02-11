import type { BuiltinToolManifest } from '@lobechat/types';

import { AdminOpsApiName } from './types';

export const AdminOpsIdentifier = 'admin.ops.v1';

const systemPrompt = `You can manage teaching operations by starting durable Workbench runs using the unified tool \`admin.ops.v1\` (display name: 教学).

Supported entities:
- Roster: schools, classes, teachers, students
- Academic config: academic years, grades, subjects
- Assignment domain: assignments, questions, submissions, submission_questions
- Assignment authoring workflow: draft create/save/publish

CRITICAL (ID resolution):
- If the user provides any entity by name/attributes (not an explicit numeric ID), you MUST call **Resolve Entity (Semantic)** first. Do this even if the name looks exact (e.g., “物理”).
- Only use \`list*\` actions after Resolve Entity returns \`no_match\`, or when the user explicitly asks to browse a full list with coarse filters.
- Never try to "find by name" using \`list*\` — list endpoints are not name-search and may return large pages.

How to resolve:
1) Identify entity types mentioned (school/grade/subject/teacher/class/student/assignment/question/submission/submission_question).
2) Call Resolve Entity once per type. As soon as you have one ID, use it to narrow subsequent calls via \`scope\`.
3) If \`status=ambiguous\`, ask the user to pick a candidate ID before proceeding.

Example:
- 用户说“给开封高级中学高三布置物理作业”
  - resolveEntity {"entity_type":"school","query":"开封高级中学"}
  - resolveEntity {"entity_type":"grade","query":"高三"}
  - resolveEntity {"entity_type":"subject","query":"物理"}

General guidelines:
- Users will speak in natural language. Before calling any tool, inspect the tool's JSON schema and ask the user for any missing required fields. Ask for at most 3 missing items at a time and provide a copy/paste reply template.
- Use list actions to browse/read (they are safe and do not require confirmation) ONLY after the resolution rule above.
- Any DB write (create/update/delete/import/bulk delete/sql patch execute) must be explicit and should be confirmed by the user.
- SQL patch must be a single UPDATE/INSERT statement and MUST be tenant-scoped (use \`tenant_id = __TENANT_ID__\`). Never use DELETE/DDL.

Execution modes:
- **Blocking (fast)**: list + single CRUD + bulk delete + sql patch preview/execute will return a short result summary directly.
- **Non-blocking (long-running)**: CSV import runs in the background.
  - Preferred: if the current conversation already includes an uploaded CSV (\`<file ... url="...">\`), call \`import*\` with \`csvFileUrl\` (and optional \`csvFileName\`/\`defaults\`) to start import directly.
  - Fallback: if no CSV file URL is available, open the list page and guide the user to click \`Import CSV\` in the right-side Workbench panel.`;

const csvImportApiParameters = {
  additionalProperties: false,
  properties: {
    csvFileName: { maxLength: 255, minLength: 1, type: 'string' },
    csvFileUrl: { format: 'uri', maxLength: 4096, minLength: 1, type: 'string' },
    defaults: {
      additionalProperties: false,
      properties: {
        academic_year_id: { minimum: 1, type: 'integer' },
        city: { maxLength: 100, minLength: 1, type: 'string' },
        class_id: { minimum: 1, type: 'integer' },
        education_level: { maxLength: 64, minLength: 1, type: 'string' },
        province: { maxLength: 100, minLength: 1, type: 'string' },
        role: { enum: ['TEACHER', 'ADMIN', 'PRINCIPAL'], type: 'string' },
        school_id: { minimum: 1, type: 'integer' },
        tags: { items: { maxLength: 100, minLength: 1, type: 'string' }, type: 'array' },
      },
      type: 'object',
    },
  },
  type: 'object',
} as const;

/* eslint-disable sort-keys-fix/sort-keys-fix */
export const AdminOpsManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Resolve a fuzzy entity reference (name/attributes) into ranked candidate IDs (P12-1). Produces an admin.entity.resolve@v1 artifact. FIRST choice when the user does not know an ID (even if the name looks exact).',
      humanIntervention: 'never',
      name: AdminOpsApiName.resolveEntity,
      parameters: {
        additionalProperties: false,
        properties: {
          entity_type: {
            enum: [
              'school',
              'subject',
              'grade',
              'teacher',
              'class',
              'student',
              'assignment',
              'question',
              'submission',
              'submission_question',
            ],
            type: 'string',
          },
          limit: { default: 5, maximum: 20, minimum: 1, type: 'integer' },
          query: { maxLength: 256, minLength: 1, type: 'string' },
          scope: {
            additionalProperties: false,
            default: {},
            properties: {
              assignment_id: { minimum: 1, type: 'integer' },
              class_id: { minimum: 1, type: 'integer' },
              grade_id: { minimum: 1, type: 'integer' },
              school_id: { minimum: 1, type: 'integer' },
              student_id: { minimum: 1, type: 'integer' },
              subject_id: { minimum: 1, type: 'integer' },
              submission_id: { minimum: 1, type: 'integer' },
              teacher_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
        },
        required: ['entity_type', 'query'],
        type: 'object',
      },
    },
    {
      description:
        'List schools by coarse region filters (city/province) (produces an admin.entity.list@v1 artifact). No name search. If the user provides a school name, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listSchools,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              city: { maxLength: 100, minLength: 1, type: 'string' },
              province: { maxLength: 100, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List classes with coarse filters (produces an admin.entity.list@v1 artifact). No name search. If the user provides a class name/label, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listClasses,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              academic_year_id: { minimum: 1, type: 'integer' },
              grade: { maxLength: 50, minLength: 1, type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List students with coarse filters (produces an admin.entity.list@v1 artifact). No name search. If the user provides a student name/attributes, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listStudents,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              academic_year_id: { minimum: 1, type: 'integer' },
              class_id: { minimum: 1, type: 'integer' },
              grade: { maxLength: 50, minLength: 1, type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List teachers with coarse filters (produces an admin.entity.list@v1 artifact). No name search. If the user provides a teacher name, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listTeachers,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              role: { enum: ['TEACHER', 'ADMIN', 'PRINCIPAL'], type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List academic years (produces an admin.entity.list@v1 artifact). Not for name → ID mapping; if the user provides a label, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listAcademicYears,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: { additionalProperties: false, default: {}, properties: {}, type: 'object' },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List grades (produces an admin.entity.list@v1 artifact). No name search. If the user provides a grade label (“高一/高三/高中一年级”), call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listGrades,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: { education_level: { maxLength: 10, minLength: 1, type: 'string' } },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List subjects (produces an admin.entity.list@v1 artifact). No name search. If the user provides a subject name (“物理/Physics”), call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listSubjects,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: { subject_category: { maxLength: 20, minLength: 1, type: 'string' } },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List assignments with coarse filters (subject_id/grade_id). No name search. If the user provides an assignment title, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listAssignments,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              grade_id: { minimum: 1, type: 'integer' },
              subject_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List canonical questions with coarse filters. No name search. If the user provides a fuzzy question reference, call Resolve Entity (Semantic) instead.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listQuestions,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              grade_id: { minimum: 1, type: 'integer' },
              question_type: {
                enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'problem_solving'],
                type: 'string',
              },
              subject_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List submissions with coarse filters. Contains student work metadata; use resolve + scoped queries for precise targeting.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listSubmissions,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              assignment_student_id: { minimum: 1, type: 'integer' },
              status: { maxLength: 20, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },
    {
      description:
        'List submission_question rows with coarse filters. Contains student work metadata; use scoped resolve for precise targeting.',
      humanIntervention: 'never',
      name: AdminOpsApiName.listSubmissionQuestions,
      parameters: {
        additionalProperties: false,
        properties: {
          after_id: { minimum: 0, type: 'integer' },
          filters: {
            additionalProperties: false,
            default: {},
            properties: {
              is_correct: { type: 'boolean' },
              question_id: { minimum: 1, type: 'integer' },
              submission_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          include_total: { default: false, type: 'boolean' },
          page: { default: 1, minimum: 1, type: 'integer' },
          page_size: { default: 50, maximum: 200, minimum: 1, type: 'integer' },
        },
        type: 'object',
      },
    },

    {
      description: 'Create a school. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createSchool,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              address: { maxLength: 2000, type: 'string' },
              city: { maxLength: 100, minLength: 1, type: 'string' },
              contact_email: { maxLength: 100, type: 'string' },
              contact_phone: { maxLength: 20, type: 'string' },
              name: { maxLength: 200, minLength: 1, type: 'string' },
              province: { maxLength: 100, minLength: 1, type: 'string' },
              tags: {
                default: [],
                items: { maxLength: 50, minLength: 1, type: 'string' },
                type: 'array',
              },
            },
            required: ['name', 'city', 'province'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a school. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateSchool,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              address: { maxLength: 2000, type: 'string' },
              city: { maxLength: 100, minLength: 1, type: 'string' },
              contact_email: { maxLength: 100, type: 'string' },
              contact_phone: { maxLength: 20, type: 'string' },
              name: { maxLength: 200, minLength: 1, type: 'string' },
              province: { maxLength: 100, minLength: 1, type: 'string' },
              tags: { items: { maxLength: 50, minLength: 1, type: 'string' }, type: 'array' },
            },
            type: 'object',
          },
          school_id: { minimum: 1, type: 'integer' },
        },
        required: ['school_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a school (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteSchool,
      parameters: {
        additionalProperties: false,
        properties: { school_id: { minimum: 1, type: 'integer' } },
        required: ['school_id'],
        type: 'object',
      },
    },

    {
      description: 'Create a class. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createClass,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              academic_year_id: { minimum: 1, type: 'integer' },
              admission_year: { minimum: 1900, maximum: 3000, type: 'integer' },
              education_level: { maxLength: 10, minLength: 1, type: 'string' },
              graduation_year: { minimum: 1900, maximum: 3000, type: 'integer' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
            },
            required: ['name', 'admission_year', 'graduation_year', 'education_level'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a class. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateClass,
      parameters: {
        additionalProperties: false,
        properties: {
          class_id: { minimum: 1, type: 'integer' },
          patch: {
            additionalProperties: false,
            properties: {
              academic_year_id: { minimum: 1, type: 'integer' },
              admission_year: { minimum: 1900, maximum: 3000, type: 'integer' },
              education_level: { maxLength: 10, minLength: 1, type: 'string' },
              graduation_year: { minimum: 1900, maximum: 3000, type: 'integer' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
        },
        required: ['class_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a class (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteClass,
      parameters: {
        additionalProperties: false,
        properties: { class_id: { minimum: 1, type: 'integer' } },
        required: ['class_id'],
        type: 'object',
      },
    },

    {
      description: 'Create a teacher. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createTeacher,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              password: { maxLength: 200, minLength: 8, type: 'string' },
              real_name: { maxLength: 50, minLength: 1, type: 'string' },
              role: { default: 'TEACHER', enum: ['TEACHER', 'ADMIN', 'PRINCIPAL'], type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
              teacher_number: { maxLength: 20, type: 'string' },
              username: { maxLength: 50, minLength: 1, type: 'string' },
            },
            required: ['username', 'password', 'real_name'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description:
        'Update a teacher (password changes are not supported here). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateTeacher,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              real_name: { maxLength: 50, minLength: 1, type: 'string' },
              role: { enum: ['TEACHER', 'ADMIN', 'PRINCIPAL'], type: 'string' },
              school_id: { minimum: 1, type: 'integer' },
              teacher_number: { maxLength: 20, type: 'string' },
              username: { maxLength: 50, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
          teacher_id: { minimum: 1, type: 'integer' },
        },
        required: ['teacher_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a teacher (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteTeacher,
      parameters: {
        additionalProperties: false,
        properties: { teacher_id: { minimum: 1, type: 'integer' } },
        required: ['teacher_id'],
        type: 'object',
      },
    },

    {
      description: 'Create a student. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createStudent,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              class_id: { minimum: 1, type: 'integer' },
              gender: { maxLength: 10, type: 'string' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              pinyin_name: { maxLength: 200, type: 'string' },
              student_number: { maxLength: 20, minLength: 1, type: 'string' },
            },
            required: ['student_number', 'name'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a student. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateStudent,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              class_id: { minimum: 1, type: 'integer' },
              gender: { maxLength: 10, type: 'string' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              pinyin_name: { maxLength: 200, type: 'string' },
              student_number: { maxLength: 20, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
          student_id: { minimum: 1, type: 'integer' },
        },
        required: ['student_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a student (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteStudent,
      parameters: {
        additionalProperties: false,
        properties: { student_id: { minimum: 1, type: 'integer' } },
        required: ['student_id'],
        type: 'object',
      },
    },

    {
      description: 'Create an academic year. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createAcademicYear,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              end_date: { minLength: 1, maxLength: 32, type: 'string' },
              name: { maxLength: 20, minLength: 1, type: 'string' },
              start_date: { minLength: 1, maxLength: 32, type: 'string' },
            },
            required: ['name', 'start_date', 'end_date'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update an academic year. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateAcademicYear,
      parameters: {
        additionalProperties: false,
        properties: {
          academic_year_id: { minimum: 1, type: 'integer' },
          patch: {
            additionalProperties: false,
            properties: {
              end_date: { minLength: 1, maxLength: 32, type: 'string' },
              name: { maxLength: 20, minLength: 1, type: 'string' },
              start_date: { minLength: 1, maxLength: 32, type: 'string' },
            },
            type: 'object',
          },
        },
        required: ['academic_year_id', 'patch'],
        type: 'object',
      },
    },
    {
      description:
        'Delete an academic year (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteAcademicYear,
      parameters: {
        additionalProperties: false,
        properties: { academic_year_id: { minimum: 1, type: 'integer' } },
        required: ['academic_year_id'],
        type: 'object',
      },
    },

    {
      description: 'Create a grade. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createGrade,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              education_level: { maxLength: 10, minLength: 1, type: 'string' },
              grade_order: { minimum: 1, type: 'integer' },
              is_graduation_grade: { type: 'boolean' },
              name: { maxLength: 20, minLength: 1, type: 'string' },
            },
            required: ['name', 'education_level', 'grade_order'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a grade. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateGrade,
      parameters: {
        additionalProperties: false,
        properties: {
          grade_id: { minimum: 1, type: 'integer' },
          patch: {
            additionalProperties: false,
            properties: {
              education_level: { maxLength: 10, minLength: 1, type: 'string' },
              grade_order: { minimum: 1, type: 'integer' },
              is_graduation_grade: { type: 'boolean' },
              name: { maxLength: 20, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
        },
        required: ['grade_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a grade (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteGrade,
      parameters: {
        additionalProperties: false,
        properties: { grade_id: { minimum: 1, type: 'integer' } },
        required: ['grade_id'],
        type: 'object',
      },
    },

    {
      description: 'Create a subject. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createSubject,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              is_core_subject: { type: 'boolean' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              subject_category: { maxLength: 20, minLength: 1, type: 'string' },
            },
            required: ['name'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a subject. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateSubject,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              is_core_subject: { type: 'boolean' },
              name: { maxLength: 50, minLength: 1, type: 'string' },
              subject_category: { maxLength: 20, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
          subject_id: { minimum: 1, type: 'integer' },
        },
        required: ['subject_id', 'patch'],
        type: 'object',
      },
    },
    {
      description: 'Delete a subject (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteSubject,
      parameters: {
        additionalProperties: false,
        properties: { subject_id: { minimum: 1, type: 'integer' } },
        required: ['subject_id'],
        type: 'object',
      },
    },
    {
      description: 'Create an assignment. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createAssignment,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              assign_date: { minLength: 1, maxLength: 64, type: 'string' },
              created_by_teachers: {
                items: { minimum: 1, type: 'integer' },
                type: 'array',
              },
              creation_type: { maxLength: 20, minLength: 1, type: 'string' },
              due_date: { minLength: 1, maxLength: 64, type: 'string' },
              file_keys: {
                items: { maxLength: 1024, minLength: 1, type: 'string' },
                type: 'array',
              },
              grade_id: { minimum: 1, type: 'integer' },
              subject_id: { minimum: 1, type: 'integer' },
              title: { maxLength: 200, minLength: 1, type: 'string' },
            },
            required: ['title', 'subject_id', 'grade_id'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update an assignment. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateAssignment,
      parameters: {
        additionalProperties: false,
        properties: {
          assignment_id: { minimum: 1, type: 'integer' },
          patch: {
            additionalProperties: false,
            properties: {
              assign_date: { minLength: 1, maxLength: 64, type: 'string' },
              created_by_teachers: {
                items: { minimum: 1, type: 'integer' },
                type: 'array',
              },
              creation_type: { maxLength: 20, minLength: 1, type: 'string' },
              due_date: { minLength: 1, maxLength: 64, type: 'string' },
              file_keys: {
                items: { maxLength: 1024, minLength: 1, type: 'string' },
                type: 'array',
              },
              grade_id: { minimum: 1, type: 'integer' },
              subject_id: { minimum: 1, type: 'integer' },
              title: { maxLength: 200, minLength: 1, type: 'string' },
            },
            type: 'object',
          },
        },
        required: ['assignment_id', 'patch'],
        type: 'object',
      },
    },
    {
      description:
        'Delete an assignment (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteAssignment,
      parameters: {
        additionalProperties: false,
        properties: { assignment_id: { minimum: 1, type: 'integer' } },
        required: ['assignment_id'],
        type: 'object',
      },
    },
    {
      description: 'Create a question. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createQuestion,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              answer: { type: 'object' },
              content: { type: 'object' },
              created_by_teachers: { items: { minimum: 1, type: 'integer' }, type: 'array' },
              creation_type: { maxLength: 20, minLength: 1, type: 'string' },
              difficulty: { minimum: 0, maximum: 1, type: 'number' },
              extra_data: { type: 'object' },
              grade_id: { minimum: 1, type: 'integer' },
              knowledge_points: {
                items: { maxLength: 128, minLength: 1, type: 'string' },
                type: 'array',
              },
              question_type: {
                enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'problem_solving'],
                type: 'string',
              },
              subject_id: { minimum: 1, type: 'integer' },
              thinking: { type: 'object' },
            },
            required: ['subject_id', 'grade_id', 'question_type', 'content', 'answer'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a question. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateQuestion,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              answer: { type: 'object' },
              content: { type: 'object' },
              created_by_teachers: { items: { minimum: 1, type: 'integer' }, type: 'array' },
              creation_type: { maxLength: 20, minLength: 1, type: 'string' },
              difficulty: { minimum: 0, maximum: 1, type: 'number' },
              extra_data: { type: 'object' },
              grade_id: { minimum: 1, type: 'integer' },
              knowledge_points: {
                items: { maxLength: 128, minLength: 1, type: 'string' },
                type: 'array',
              },
              question_type: {
                enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'problem_solving'],
                type: 'string',
              },
              subject_id: { minimum: 1, type: 'integer' },
              thinking: { type: 'object' },
            },
            type: 'object',
          },
          question_id: { minimum: 1, type: 'integer' },
        },
        required: ['question_id', 'patch'],
        type: 'object',
      },
    },
    {
      description:
        'Delete a question (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteQuestion,
      parameters: {
        additionalProperties: false,
        properties: { question_id: { minimum: 1, type: 'integer' } },
        required: ['question_id'],
        type: 'object',
      },
    },
    {
      description: 'Create a submission. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createSubmission,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              assignment_student_id: { minimum: 1, type: 'integer' },
              file_keys: {
                items: { maxLength: 1024, minLength: 1, type: 'string' },
                type: 'array',
              },
              graded_at: { minLength: 1, maxLength: 64, type: 'string' },
              graded_by: { maxLength: 20, minLength: 1, type: 'string' },
              report_path: { maxLength: 255, minLength: 1, type: 'string' },
              score: { type: 'number' },
              status: { maxLength: 20, minLength: 1, type: 'string' },
              submitted_at: { minLength: 1, maxLength: 64, type: 'string' },
              total_score: { type: 'number' },
            },
            required: ['assignment_student_id'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description: 'Update a submission. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateSubmission,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              assignment_student_id: { minimum: 1, type: 'integer' },
              file_keys: {
                items: { maxLength: 1024, minLength: 1, type: 'string' },
                type: 'array',
              },
              graded_at: { minLength: 1, maxLength: 64, type: 'string' },
              graded_by: { maxLength: 20, minLength: 1, type: 'string' },
              report_path: { maxLength: 255, minLength: 1, type: 'string' },
              score: { type: 'number' },
              status: { maxLength: 20, minLength: 1, type: 'string' },
              submitted_at: { minLength: 1, maxLength: 64, type: 'string' },
              total_score: { type: 'number' },
            },
            type: 'object',
          },
          submission_id: { minimum: 1, type: 'integer' },
        },
        required: ['submission_id', 'patch'],
        type: 'object',
      },
    },
    {
      description:
        'Delete a submission (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteSubmission,
      parameters: {
        additionalProperties: false,
        properties: { submission_id: { minimum: 1, type: 'integer' } },
        required: ['submission_id'],
        type: 'object',
      },
    },
    {
      description:
        'Create a submission_question row. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.createSubmissionQuestion,
      parameters: {
        additionalProperties: false,
        properties: {
          payload: {
            additionalProperties: false,
            properties: {
              feedback: { maxLength: 200_000, minLength: 1, type: 'string' },
              is_correct: { type: 'boolean' },
              max_score: { type: 'number' },
              order_index: { minimum: 1, type: 'integer' },
              question_id: { minimum: 1, type: 'integer' },
              score: { type: 'number' },
              student_answer: { maxLength: 200_000, minLength: 1, type: 'string' },
              submission_id: { minimum: 1, type: 'integer' },
            },
            required: ['submission_id', 'order_index'],
            type: 'object',
          },
        },
        required: ['payload'],
        type: 'object',
      },
    },
    {
      description:
        'Update a submission_question row. Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.updateSubmissionQuestion,
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: {
              feedback: { maxLength: 200_000, minLength: 1, type: 'string' },
              is_correct: { type: 'boolean' },
              max_score: { type: 'number' },
              order_index: { minimum: 1, type: 'integer' },
              question_id: { minimum: 1, type: 'integer' },
              score: { type: 'number' },
              student_answer: { maxLength: 200_000, minLength: 1, type: 'string' },
              submission_id: { minimum: 1, type: 'integer' },
            },
            type: 'object',
          },
          submission_question_id: { minimum: 1, type: 'integer' },
        },
        required: ['submission_question_id', 'patch'],
        type: 'object',
      },
    },
    {
      description:
        'Delete a submission_question row (hard delete). Produces an admin.mutation.result@v1 artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.deleteSubmissionQuestion,
      parameters: {
        additionalProperties: false,
        properties: { submission_question_id: { minimum: 1, type: 'integer' } },
        required: ['submission_question_id'],
        type: 'object',
      },
    },
    {
      description:
        'Create a new empty assignment draft (manual authoring) for the current conversation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.draftCreateManual,
      parameters: {
        additionalProperties: false,
        properties: {
          dueDate: { description: 'Optional due date (RFC3339 date-time).', type: 'string' },
          gradeId: { description: 'Grade id.', minimum: 1, type: 'number' },
          subjectId: { description: 'Subject id.', minimum: 1, type: 'number' },
          title: { description: 'Assignment title.', maxLength: 255, minLength: 1, type: 'string' },
        },
        required: ['title', 'subjectId', 'gradeId'],
        type: 'object',
      },
    },
    {
      description:
        'Save a draft update: creates a new assignment.draft revision and upserts canonical questions.',
      humanIntervention: 'required',
      name: AdminOpsApiName.draftSave,
      parameters: {
        additionalProperties: false,
        properties: {
          draftArtifactId: {
            description: 'The latest assignment.draft artifact id.',
            minLength: 1,
            type: 'string',
          },
          dueDate: { description: 'Optional due date (RFC3339 date-time).', type: 'string' },
          questions: {
            description: 'Draft questions (v1 JSON).',
            items: { type: 'object' },
            minItems: 1,
            type: 'array',
          },
          title: {
            description: 'Optional updated title.',
            maxLength: 255,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['draftArtifactId', 'questions'],
        type: 'object',
      },
    },
    {
      description:
        'Publish a draft into a persisted assignment and produce an assignment.publish.result artifact.',
      humanIntervention: 'required',
      name: AdminOpsApiName.draftPublish,
      parameters: {
        additionalProperties: false,
        properties: {
          draftArtifactId: {
            description: 'The latest assignment.draft artifact id.',
            minLength: 1,
            type: 'string',
          },
          target: {
            additionalProperties: false,
            description: 'Optional publish targets.',
            properties: {
              classIds: { items: { minimum: 1, type: 'number' }, type: 'array' },
              studentIds: { items: { minimum: 1, type: 'number' }, type: 'array' },
            },
            type: 'object',
          },
        },
        required: ['draftArtifactId'],
        type: 'object',
      },
    },

    {
      description:
        'Import schools from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the schools list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importSchools,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import classes from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the classes list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importClasses,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import teachers from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the teachers list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importTeachers,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import students from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the students list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importStudents,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import academic years from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the academic years list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importAcademicYears,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import grades from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the grades list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importGrades,
      parameters: csvImportApiParameters,
    },
    {
      description:
        'Import subjects from a conversation-uploaded CSV via `csvFileUrl` (preferred). If `csvFileUrl` is omitted, open the subjects list and let user click "Import CSV" in the right-side panel (produces admin.import.result@v1).',
      humanIntervention: 'required',
      name: AdminOpsApiName.importSubjects,
      parameters: csvImportApiParameters,
    },

    {
      description:
        'Preview a bulk student delete (produces an admin.bulk_delete.preview@v1 artifact; no write).',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteStudentsPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          student_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['student_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a bulk student delete (produces an admin.bulk_delete.result@v1 artifact). Requires confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteStudentsExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          student_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['student_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Preview a bulk school delete (produces an admin.bulk_delete.preview@v1 artifact; no write).',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteSchoolsPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          school_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['school_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a bulk school delete (produces an admin.bulk_delete.result@v1 artifact). Requires confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteSchoolsExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          school_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['school_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Preview a bulk academic year delete (produces an admin.bulk_delete.preview@v1 artifact; no write).',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteAcademicYearsPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          academic_year_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['academic_year_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a bulk academic year delete (produces an admin.bulk_delete.result@v1 artifact). Requires confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteAcademicYearsExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          academic_year_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['academic_year_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Preview a bulk grade delete (produces an admin.bulk_delete.preview@v1 artifact; no write).',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteGradesPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          grade_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['grade_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a bulk grade delete (produces an admin.bulk_delete.result@v1 artifact). Requires confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteGradesExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          grade_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['grade_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Preview a bulk subject delete (produces an admin.bulk_delete.preview@v1 artifact; no write).',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteSubjectsPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          subject_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['subject_ids'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a bulk subject delete (produces an admin.bulk_delete.result@v1 artifact). Requires confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.bulkDeleteSubjectsExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          subject_ids: { items: { minimum: 1, type: 'integer' }, minItems: 1, type: 'array' },
        },
        required: ['subject_ids'],
        type: 'object',
      },
    },

    {
      description:
        'Preview a SQL patch (uploads sql_text via presigned URL, then runs admin.sql_patch.preview). Requires system_admin.',
      humanIntervention: 'required',
      name: AdminOpsApiName.sqlPatchPreview,
      parameters: {
        additionalProperties: false,
        properties: {
          max_affected_rows: { maximum: 10_000, minimum: 1, type: 'integer' },
          sql_text: { minLength: 1, type: 'string' },
        },
        required: ['sql_text', 'max_affected_rows'],
        type: 'object',
      },
    },
    {
      description:
        'Execute a SQL patch (uploads sql_text via presigned URL, then runs admin.sql_patch.execute). Requires system_admin and confirmation.',
      humanIntervention: 'required',
      name: AdminOpsApiName.sqlPatchExecute,
      parameters: {
        additionalProperties: false,
        properties: {
          max_affected_rows: { maximum: 10_000, minimum: 1, type: 'integer' },
          sql_text: { minLength: 1, type: 'string' },
        },
        required: ['sql_text', 'max_affected_rows'],
        type: 'object',
      },
    },
  ],
  identifier: AdminOpsIdentifier,
  meta: {
    avatar: '🎓',
    title: '教学',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
