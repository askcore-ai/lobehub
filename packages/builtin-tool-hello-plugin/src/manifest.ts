import type { BuiltinToolManifest } from '@lobechat/types';

import { HelloPluginApiName } from './types';

export const HelloPluginIdentifier = 'aitutor-hello-plugin';

const systemPrompt = `You can produce and edit hello-plugin artifacts for the current chat.

IMPORTANT: These actions write durable artifacts. Use them ONLY when the user explicitly asks to run or save hello-plugin artifacts, and always follow confirmation requirements.`;

/* eslint-disable sort-keys-fix/sort-keys-fix */
export const HelloPluginManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Produce hello-plugin demo artifacts for the current chat (durable run). IMPORTANT: All inputs/outputs may be captured in traces; do not include secrets or sensitive student data.',
      humanIntervention: 'required',
      name: HelloPluginApiName.helloRun,
      parameters: {
        additionalProperties: false,
        properties: {
          message: { description: 'A short message to include in the hello note.', type: 'string' },
        },
        required: ['message'],
        type: 'object',
      },
    },
    {
      description:
        'Save an edit as a new hello.table revision (durable run). Requires explicit confirmation. Conflict may occur if not based on latest revision.',
      humanIntervention: 'required',
      name: HelloPluginApiName.helloSave,
      parameters: {
        additionalProperties: false,
        properties: {
          baseArtifactId: { description: 'The artifact being edited.', type: 'string' },
          expectedLatestArtifactId: {
            description: 'The latest revision id the editor is based on (optimistic concurrency).',
            type: 'string',
          },
          content: { description: 'New artifact content payload.', type: 'object' },
        },
        required: ['baseArtifactId', 'expectedLatestArtifactId', 'content'],
        type: 'object',
      },
    },
  ],
  identifier: HelloPluginIdentifier,
  meta: {
    avatar: '👋',
    title: 'Hello Plugin',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
