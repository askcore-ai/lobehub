import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { AssignmentAuthoringIdentifier,  } from './manifest';
import {
  AssignmentAuthoringApiName,
  type DraftCreateManualParams,
  type DraftPublishParams,
  type DraftSaveParams,
} from './types';

type StartInvocationResponse = { invocation_id: string; run_id: number };

const _conversationId = (ctx: BuiltinToolContext): string | null => {
  if (!ctx.topicId) return null;
  return ctx.threadId ? `lc_thread:${ctx.threadId}` : `lc_topic:${ctx.topicId}`;
};

class AssignmentAuthoringExecutor extends BaseExecutor<typeof AssignmentAuthoringApiName> {
  readonly identifier = AssignmentAuthoringIdentifier;
  protected readonly apiEnum = AssignmentAuthoringApiName;

  draftCreateManual = async (
    params: DraftCreateManualParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
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

      const idempotencyKey = `assignment-draft-create-manual:${ctx.messageId}`;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'assignment.draft.create_manual',
          confirmation_id: null,
          conversation_id: conversationId,
          params: {
            due_date: params.dueDate,
            grade_id: params.gradeId,
            subject_id: params.subjectId,
            title: params.title,
          },
          plugin_id: AssignmentAuthoringIdentifier,
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
              ? 'Assignment Authoring is currently disabled. Ask an administrator to enable it.'
              : `Failed to create assignment draft: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      const runId = data.run_id;

      return {
        content:
          `Started assignment draft creation (run ${runId}). ` +
          'Open Workbench → Workspace and select this run to view status and edit the draft.',
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to create assignment draft: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  };

  draftSave = async (
    params: DraftSaveParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
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

      const idempotencyKey = `assignment-draft-save:${ctx.messageId}`;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'assignment.draft.save',
          confirmation_id: null,
          conversation_id: conversationId,
          params: {
            draft_artifact_id: params.draftArtifactId,
            due_date: params.dueDate,
            questions: params.questions,
            title: params.title,
          },
          plugin_id: AssignmentAuthoringIdentifier,
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
              ? 'Assignment Authoring is currently disabled. Ask an administrator to enable it.'
              : `Failed to save assignment draft: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      const runId = data.run_id;

      return {
        content:
          `Started assignment draft save (run ${runId}). ` +
          'Open Workbench → Workspace and select this run to view status and artifacts.',
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to save assignment draft: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  };

  draftPublish = async (
    params: DraftPublishParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
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

      const idempotencyKey = `assignment-draft-publish:${ctx.messageId}`;
      const confirmationId = `confirm:${ctx.messageId}`;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'assignment.draft.publish',
          confirmation_id: confirmationId,
          conversation_id: conversationId,
          params: {
            draft_artifact_id: params.draftArtifactId,
            target: {
              class_ids: params.target?.classIds || [],
              student_ids: params.target?.studentIds || [],
            },
          },
          plugin_id: AssignmentAuthoringIdentifier,
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
              ? 'Assignment Authoring is currently disabled. Ask an administrator to enable it.'
              : `Failed to publish assignment draft: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      const runId = data.run_id;

      return {
        content:
          `Started assignment publish (run ${runId}). ` +
          'Open Workbench → Workspace and select this run to view status and publish result.',
        state: { runId },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to publish assignment draft: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  };
}

export const assignmentAuthoringExecutor = new AssignmentAuthoringExecutor();

export * from './manifest';
export {AssignmentAuthoringManifest} from './manifest';
export * from './types';