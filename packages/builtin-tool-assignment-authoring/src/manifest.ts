import type { BuiltinToolManifest } from '@lobechat/types';

import { AssignmentAuthoringApiName } from './types';

export const AssignmentAuthoringIdentifier = 'assignment.authoring.v1';

const systemPrompt = `You can create, save, and publish assignment drafts via the Assignment Authoring tool.

IMPORTANT:
- These actions create durable Workbench runs and artifacts.
- Use them ONLY when the user explicitly asks to create/save/publish an assignment draft.
- Do NOT include secrets or sensitive student data.
- High-risk actions require explicit confirmation.`;

/* eslint-disable sort-keys-fix/sort-keys-fix */
export const AssignmentAuthoringManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Create a new empty assignment draft (manual authoring) for the current conversation. Returns a Workbench run id.',
      humanIntervention: 'required',
      name: AssignmentAuthoringApiName.draftCreateManual,
      parameters: {
        additionalProperties: false,
        properties: {
          dueDate: { description: 'Optional due date (RFC3339 date-time).', type: 'string' },
          gradeId: { description: 'Grade id.', minimum: 1, type: 'number' },
          subjectId: { description: 'Subject id.', minimum: 1, type: 'number' },
          title: { description: 'Assignment title.', type: 'string' },
        },
        required: ['title', 'subjectId', 'gradeId'],
        type: 'object',
      },
    },
    {
      description:
        'Save a draft update: creates a new assignment.draft revision and upserts canonical questions. Conflict may occur if not based on the latest revision.',
      humanIntervention: 'required',
      name: AssignmentAuthoringApiName.draftSave,
      parameters: {
        additionalProperties: false,
        properties: {
          draftArtifactId: {
            description: 'The latest assignment.draft artifact id.',
            type: 'string',
          },
          dueDate: { description: 'Optional due date (RFC3339 date-time).', type: 'string' },
          questions: {
            description: 'Draft questions (v1 JSON).',
            items: { type: 'object' },
            type: 'array',
          },
          title: { description: 'Optional updated title.', type: 'string' },
        },
        required: ['draftArtifactId', 'questions'],
        type: 'object',
      },
    },
    {
      description:
        'Publish a draft into an assignment (may be mocked) and produce an assignment.publish.result artifact. Requires explicit confirmation.',
      humanIntervention: 'required',
      name: AssignmentAuthoringApiName.draftPublish,
      parameters: {
        additionalProperties: false,
        properties: {
          draftArtifactId: {
            description: 'The latest assignment.draft artifact id.',
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
  ],
  identifier: AssignmentAuthoringIdentifier,
  meta: {
    avatar: '📝',
    title: 'Assignment Authoring',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
