import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { AssignmentAuthoringIdentifier } from './manifest';
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

  private async _startInvocation(options: {
    actionId: string;
    contentHint: string;
    ctx: BuiltinToolContext;
    params: Record<string, unknown>;
    requireConfirmation: boolean;
  }): Promise<BuiltinToolResult> {
    const conversationId = _conversationId(options.ctx);
    if (!conversationId) {
      return {
        content:
          'Save this conversation first. Workbench runs and artifacts must be linked to a durable conversation.',
        error: { message: 'Conversation not saved', type: 'WorkbenchConversationUnsaved' },
        success: false,
      };
    }

    try {
      const idempotencyKey = `assignment-authoring:${options.actionId}:${options.ctx.messageId}`;
      const confirmationId = options.requireConfirmation
        ? `confirm:${options.ctx.messageId}`
        : null;

      const res = await fetch('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: options.actionId,
          confirmation_id: confirmationId,
          conversation_id: conversationId,
          params: options.params,
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
              : `Failed to start run: ${text || res.status}`,
          error: { message: text || 'Request failed', type },
          success: false,
        };
      }

      const data = (await res.json()) as StartInvocationResponse;
      return {
        content:
          `${options.contentHint} (run ${data.run_id}). ` +
          'Click the run card to open Workbench and continue in the right panel.',
        state: {
          actionId: options.actionId,
          artifactId: undefined,
          conversationId,
          invocationId: data.invocation_id,
          runId: data.run_id,
        },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Failed to start run: ${message}`,
        error: { message, type: 'WorkbenchInvocationFailed' },
        success: false,
      };
    }
  }

  draftCreateManual = async (
    params: DraftCreateManualParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this._startInvocation({
      actionId: 'assignment.draft.create_manual',
      contentHint: 'Started assignment draft creation',
      ctx,
      params: {
        due_date: params.dueDate,
        grade_id: params.gradeId,
        subject_id: params.subjectId,
        title: params.title,
      },
      requireConfirmation: false,
    });

  draftSave = async (
    params: DraftSaveParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this._startInvocation({
      actionId: 'assignment.draft.save',
      contentHint: 'Started assignment draft save',
      ctx,
      params: {
        draft_artifact_id: params.draftArtifactId,
        due_date: params.dueDate,
        questions: params.questions,
        title: params.title,
      },
      requireConfirmation: false,
    });

  draftPublish = async (
    params: DraftPublishParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this._startInvocation({
      actionId: 'assignment.draft.publish',
      contentHint: 'Started assignment draft publish',
      ctx,
      params: {
        draft_artifact_id: params.draftArtifactId,
        target: {
          class_ids: params.target?.classIds || [],
          student_ids: params.target?.studentIds || [],
        },
      },
      requireConfirmation: true,
    });
}

export const assignmentAuthoringExecutor = new AssignmentAuthoringExecutor();

export * from './manifest';
export { AssignmentAuthoringManifest } from './manifest';
export * from './types';
