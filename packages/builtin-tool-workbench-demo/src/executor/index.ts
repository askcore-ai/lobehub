import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { WorkbenchDemoIdentifier } from '../manifest';
import { type StartDemoTaskParams, WorkbenchDemoApiName } from '../types';

type StartRunResponse = { run_id: number };

class WorkbenchDemoExecutor extends BaseExecutor<typeof WorkbenchDemoApiName> {
  readonly identifier = WorkbenchDemoIdentifier;
  protected readonly apiEnum = WorkbenchDemoApiName;

  startDemoTask = async (
    params: StartDemoTaskParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    try {
      const idempotencyKey = `workbench-demo:${ctx.messageId}`;
      const input: Record<string, unknown> = {};
      if (params.note) input.note = params.note;

      const res = await fetch('/api/workbench/runs', {
        body: JSON.stringify({ input, workflow_name: 'workbench.demo' }),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        method: 'POST',
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          content: `Failed to start demo run: ${text || res.status}`,
          error: { message: text || 'Request failed', type: 'WorkbenchStartFailed' },
          success: false,
        };
      }

      const data = (await res.json()) as StartRunResponse;
      const runId = data.run_id;

      return {
        content: `Started demo run ${runId}. Open Task Center: /workbench/task-center/${runId}`,
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to start demo run: ${message}`,
        error: { message, type: 'WorkbenchStartFailed' },
        success: false,
      };
    }
  };
}

export const workbenchDemoExecutor = new WorkbenchDemoExecutor();
