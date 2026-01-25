import type { BuiltinToolManifest } from '@lobechat/types';

import { WorkbenchDemoApiName } from './types';

export const WorkbenchDemoIdentifier = 'aitutor-workbench-demo';

const systemPrompt = `You can start a self-hosted Workbench demo task.

Use this tool ONLY when the user explicitly asks to run a demo Workbench task, or asks you to start a durable workflow run they can monitor in Task Center.`;

/* eslint-disable sort-keys-fix/sort-keys-fix */
export const WorkbenchDemoManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Start a demo Workbench task (durable run). IMPORTANT WARNINGS: tool/LLM inputs+outputs are fully captured in traces and retained indefinitely; trace access is restricted to system administrators; no compliance guarantees are made.',
      humanIntervention: 'required',
      name: WorkbenchDemoApiName.startDemoTask,
      parameters: {
        properties: {
          note: {
            description: 'Optional note to attach to the run input.',
            type: 'string',
          },
        },
        type: 'object',
      },
    },
  ],
  identifier: WorkbenchDemoIdentifier,
  meta: {
    avatar: '🧰',
    title: 'Workbench Demo',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
