import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { HelloPluginIdentifier } from '../manifest';
import { type HelloRunParams, type HelloSaveParams, HelloPluginApiName } from '../types';

type StartInvocationResponse = { invocation_id: string; run_id: number };

const _conversationId = (ctx: BuiltinToolContext): string | null => {
  if (!ctx.topicId) return null;
  return ctx.threadId ? `lc_thread:${ctx.threadId}` : `lc_topic:${ctx.topicId}`;
};

class HelloPluginExecutor extends BaseExecutor<typeof HelloPluginApiName> {
  readonly identifier = HelloPluginIdentifier;
  protected readonly apiEnum = HelloPluginApiName;

  helloRun = async (params: HelloRunParams, ctx: BuiltinToolContext): Promise<BuiltinToolResult> => {
    try {
      const conversationId = _conversationId(ctx);
      if (!conversationId) {
        return {
          content:
            'Save this conversation first. Workbench runs and artifacts must be linked to a durable conversation.',
          error: { message: 'Conversation not saved', type: 'WorkbenchConversationUnsaved' },
          success: false,
        };
      }

      const idempotencyKey = `hello-run:${ctx.messageId}`;
      const confirmationId = `confirm:${ctx.messageId}`;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'hello-run',
          confirmation_id: confirmationId,
          conversation_id: conversationId,
          params: { message: params.message },
          plugin_id: HelloPluginIdentifier,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        method: 'POST',
      });

      if (!res.ok) {
        const text = await res.text();
        const type = res.status === 403 ? 'WorkbenchPluginDisabled' : 'WorkbenchInvocationFailed';
        return {
          content:
            res.status === 403
              ? 'Hello Plugin is currently disabled. Ask an administrator to enable it.'
              : `Failed to start hello run: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      const runId = data.run_id;

      return {
        content:
          `Started hello run ${runId}. ` +
          'Watch the in-chat Task Center for status; artifacts will appear in the right Workbench panel.',
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to start hello run: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  };

  helloSave = async (params: HelloSaveParams, ctx: BuiltinToolContext): Promise<BuiltinToolResult> => {
    try {
      const conversationId = _conversationId(ctx);
      if (!conversationId) {
        return {
          content:
            'Save this conversation first. Workbench runs and artifacts must be linked to a durable conversation.',
          error: { message: 'Conversation not saved', type: 'WorkbenchConversationUnsaved' },
          success: false,
        };
      }

      const idempotencyKey = `hello-save:${ctx.messageId}`;
      const confirmationId = `confirm:${ctx.messageId}`;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'hello-save',
          confirmation_id: confirmationId,
          conversation_id: conversationId,
          params: {
            base_artifact_id: params.baseArtifactId,
            content: params.content,
            expected_latest_artifact_id: params.expectedLatestArtifactId,
          },
          plugin_id: HelloPluginIdentifier,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        method: 'POST',
      });

      if (!res.ok) {
        const text = await res.text();
        const type = res.status === 403 ? 'WorkbenchPluginDisabled' : 'WorkbenchInvocationFailed';
        return {
          content:
            res.status === 403
              ? 'Hello Plugin is currently disabled. Ask an administrator to enable it.'
              : `Failed to start hello save: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      const runId = data.run_id;

      return {
        content:
          `Started hello save run ${runId}. ` +
          'Watch the in-chat Task Center for status; the updated artifact will appear in the right Workbench panel.',
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to start hello save: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  };
}

export const helloPluginExecutor = new HelloPluginExecutor();
