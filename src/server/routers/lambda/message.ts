import {
  type ChatPluginPayload,
  type ChatToolPayloadWithResult,
  type ChatToolResult,
  CreateNewMessageParamsSchema,
  type UIChatMessage,
  UpdateMessageParamsSchema,
  UpdateMessagePluginSchema,
  UpdateMessageRAGParamsSchema,
} from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { MessageModel } from '@/database/models/message';
import { TopicShareModel } from '@/database/models/topicShare';
import { CompressionRepository } from '@/database/repositories/compression';
import { authedProcedure, publicProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { MessageService } from '@/server/services/message';

import { resolveAgentIdFromSession, resolveContext } from './_helpers/resolveContext';
import { basicContextSchema } from './_schema/context';

const SKILL_TOOL_REDACTED_CONTENT = '[Skill content hidden]';
const SKILLS_IDENTIFIER = 'lobe-skills';
const LEGACY_SKILLS_IDENTIFIER = 'lobe-tools';
const ACTIVATOR_IDENTIFIER = 'lobe-activator';
const SELECTED_SKILL_CONTEXT_REGEX =
  /\n*<selected_skill_context>[\S\s]*?<\/selected_skill_context>\n*/g;
const EMPTY_SELECTED_SKILL_CONTEXT_WRAPPER_REGEX =
  /\n*<!-- SYSTEM CONTEXT \(NOT PART OF USER QUERY\) -->\s*<context\.instruction>[\S\s]*?<\/context\.instruction>\s*<!-- END SYSTEM CONTEXT -->\n*/g;

const stripSelectedSkillContextForMessageResponse = <T>(content: T): T => {
  if (typeof content === 'string') {
    const stripped = content
      .replaceAll(SELECTED_SKILL_CONTEXT_REGEX, '\n')
      .replaceAll(EMPTY_SELECTED_SKILL_CONTEXT_WRAPPER_REGEX, '\n');

    if (stripped === content) return content as T;

    return stripped.replaceAll(/\n{3,}/g, '\n\n').trim() as T;
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part?.type !== 'text' || typeof part.text !== 'string') return part;

      return {
        ...part,
        text: stripSelectedSkillContextForMessageResponse(part.text),
      };
    }) as T;
  }

  return content;
};

const isSkillSourceDisclosureTool = ({
  apiName,
  identifier,
}: {
  apiName: string;
  identifier: string;
}) => {
  if (identifier === SKILLS_IDENTIFIER) {
    return apiName === 'activateSkill' || apiName === 'readReference';
  }

  if (identifier === ACTIVATOR_IDENTIFIER) {
    return apiName === 'activateSkill';
  }

  if (identifier === LEGACY_SKILLS_IDENTIFIER) {
    return apiName === 'activateSkill';
  }

  return false;
};

const shouldRedactSkillToolResult = (
  target: { apiName: string; identifier: string },
  result?: ChatToolResult | null,
) => {
  if (isSkillSourceDisclosureTool(target)) return true;

  return (
    target.identifier === ACTIVATOR_IDENTIFIER &&
    target.apiName === 'activateTools' &&
    Array.isArray(result?.state?.activatedSkills) &&
    result.state.activatedSkills.length > 0
  );
};

const redactSkillToolResultForMessageResponse = (
  target: { apiName: string; identifier: string },
  result?: ChatToolResult | null,
) => {
  if (!result || !shouldRedactSkillToolResult(target, result)) return result;

  return {
    ...result,
    content: SKILL_TOOL_REDACTED_CONTENT,
  };
};

export const redactSkillMessageForUserResponse = <
  T extends UIChatMessage | Record<string, any>,
>(
  message: T,
): T => {
  if (!message || typeof message !== 'object') return message;

  const plugin = (message as { plugin?: ChatPluginPayload }).plugin;
  const nextMessage: Record<string, any> = {
    ...message,
    content: stripSelectedSkillContextForMessageResponse(
      (message as { content?: unknown }).content,
    ),
  };
  const displayContent =
    typeof nextMessage.content === 'string'
      ? nextMessage.content
      : nextMessage.content === undefined
        ? null
        : JSON.stringify(nextMessage.content);

  if (
    plugin &&
    shouldRedactSkillToolResult(
      { apiName: plugin.apiName, identifier: plugin.identifier },
      {
        content: displayContent,
        id: nextMessage.id,
        state: nextMessage.pluginState,
      },
    )
  ) {
    nextMessage.content = SKILL_TOOL_REDACTED_CONTENT;
  }

  if (Array.isArray(nextMessage.tools)) {
    nextMessage.tools = nextMessage.tools.map((tool: ChatToolPayloadWithResult) => ({
      ...tool,
      result: redactSkillToolResultForMessageResponse(
        { apiName: tool.apiName, identifier: tool.identifier },
        tool.result,
      ),
    }));
  }

  for (const key of ['children', 'compressedMessages', 'pinnedMessages']) {
    if (Array.isArray(nextMessage[key])) {
      nextMessage[key] = nextMessage[key].map(redactSkillMessageForUserResponse);
    }
  }

  return nextMessage as T;
};

export const redactSkillMessagesForUserResponse = <T extends UIChatMessage | Record<string, any>>(
  messages: T[],
) => messages.map(redactSkillMessageForUserResponse);

const messageProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      compressionRepo: new CompressionRepository(ctx.serverDB, ctx.userId),
      fileService: new FileService(ctx.serverDB, ctx.userId),
      messageModel: new MessageModel(ctx.serverDB, ctx.userId),
      messageService: new MessageService(ctx.serverDB, ctx.userId),
    },
  });
});

export const messageRouter = router({
  addFilesToMessage: messageProcedure
    .input(
      z
        .object({
          fileIds: z.array(z.string()),
          id: z.string(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, fileIds, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.addFilesToMessage(id, fileIds, resolved);
    }),

  /**
   * Cancel compression by deleting the compression group and restoring original messages
   */
  cancelCompression: messageProcedure
    .input(
      z.object({
        agentId: z.string(),
        groupId: z.string().nullable().optional(),
        messageGroupId: z.string(),
        threadId: z.string().nullable().optional(),
        topicId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { messageGroupId, agentId, groupId, threadId, topicId } = input;

      return ctx.messageService.cancelCompression(messageGroupId, {
        agentId,
        groupId,
        threadId,
        topicId,
      });
    }),

  listAll: messageProcedure
    .input(
      z
        .object({
          current: z.number().optional(),
          pageSize: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.messageModel.queryAll(input);
      return redactSkillMessagesForUserResponse(messages);
    }),

  count: messageProcedure
    .input(
      z
        .object({
          endDate: z.string().optional(),
          range: z.tuple([z.string(), z.string()]).optional(),
          startDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.messageModel.count(input);
    }),

  countWords: messageProcedure
    .input(
      z
        .object({
          endDate: z.string().optional(),
          range: z.tuple([z.string(), z.string()]).optional(),
          startDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.messageModel.countWords(input);
    }),

  /**
   * Create a compression group for old messages
   * Creates a placeholder group, marks messages as compressed
   * Returns messages to summarize for frontend AI generation
   */
  createCompressionGroup: messageProcedure
    .input(
      z.object({
        agentId: z.string(),
        groupId: z.string().nullable().optional(),
        messageIds: z.array(z.string()),
        threadId: z.string().nullable().optional(),
        topicId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { topicId, messageIds, agentId, groupId, threadId } = input;

      return ctx.messageService.createCompressionGroup(topicId, messageIds, {
        agentId,
        groupId,
        threadId,
        topicId,
      });
    }),

  createMessage: messageProcedure
    .input(CreateNewMessageParamsSchema)
    .mutation(async ({ input, ctx }) => {
      // If there's no agentId but has sessionId, resolve agentId from sessionId
      let agentId = input.agentId;
      if (!agentId && input.sessionId) {
        agentId = (await resolveAgentIdFromSession(input.sessionId, ctx.serverDB, ctx.userId))!;
      }

      // Create message with the resolved agentId
      return ctx.messageService.createMessage({ ...input, agentId } as any);
    }),

  /**
   * Finalize compression by updating the group with generated summary
   */
  finalizeCompression: messageProcedure
    .input(
      z.object({
        agentId: z.string(),
        content: z.string(),
        groupId: z.string().nullable().optional(),
        messageGroupId: z.string(),
        threadId: z.string().nullable().optional(),
        topicId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { messageGroupId, content, ...params } = input;

      return ctx.messageService.finalizeCompression(messageGroupId, content, params);
    }),

  getHeatmaps: messageProcedure.query(async ({ ctx }) => {
    return ctx.messageModel.getHeatmaps();
  }),

  getMessages: publicProcedure
    .use(serverDatabase)
    .input(
      z.object({
        agentId: z.string().nullable().optional(),
        current: z.number().optional(),
        groupId: z.string().nullable().optional(),
        pageSize: z.number().optional(),
        sessionId: z.string().nullable().optional(),
        threadId: z.string().nullable().optional(),
        topicId: z.string().nullable().optional(),
        topicShareId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { topicShareId, ...queryParams } = input;

      // Public access via topicShareId
      if (topicShareId) {
        const share = await TopicShareModel.findByShareIdWithAccessCheck(
          ctx.serverDB,
          topicShareId,
          ctx.userId ?? undefined,
        );

        const messageModel = new MessageModel(ctx.serverDB, share.ownerId);
        const fileService = new FileService(ctx.serverDB, share.ownerId);

        const messages = await messageModel.query(
          { ...queryParams, topicId: share.topicId },
          {
            postProcessUrl: (path) => fileService.getFullFileUrl(path),
          },
        );

        return redactSkillMessagesForUserResponse(messages);
      }

      // Authenticated access - require userId
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const messageModel = new MessageModel(ctx.serverDB, ctx.userId);
      const fileService = new FileService(ctx.serverDB, ctx.userId);

      const messages = await messageModel.query(queryParams, {
        postProcessUrl: (path) => fileService.getFullFileUrl(path),
      });

      return redactSkillMessagesForUserResponse(messages);
    }),

  rankModels: messageProcedure.query(async ({ ctx }) => {
    return ctx.messageModel.rankModels();
  }),

  removeAllMessages: messageProcedure.mutation(async ({ ctx }) => {
    return ctx.messageModel.deleteAllMessages();
  }),

  removeMessage: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.removeMessage(id, resolved);
    }),

  removeMessageQuery: messageProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.messageModel.deleteMessageQuery(input.id);
    }),

  removeMessages: messageProcedure
    .input(
      z
        .object({
          ids: z.array(z.string()),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { ids, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.removeMessages(ids, resolved);
    }),

  removeMessagesByAssistant: messageProcedure
    .input(
      z
        .object({
          groupId: z.string().nullable().optional(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageModel.deleteMessagesBySession(
        resolved.sessionId,
        resolved.topicId,
        input.groupId,
      );
    }),

  removeMessagesByGroup: messageProcedure
    .input(
      z.object({
        groupId: z.string(),
        topicId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.messageModel.deleteMessagesBySession(null, input.topicId, input.groupId);
    }),

  searchMessages: messageProcedure
    .input(z.object({ keywords: z.string() }))
    .query(async ({ input, ctx }) => {
      const messages = await ctx.messageModel.queryByKeyword(input.keywords);
      return redactSkillMessagesForUserResponse(messages);
    }),

  update: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: UpdateMessageParamsSchema,
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateMessage(id, value as any, resolved);
    }),

  /**
   * Update message group metadata (e.g., expanded state)
   */
  updateMessageGroupMetadata: messageProcedure
    .input(
      z.object({
        context: z.object({
          agentId: z.string(),
          groupId: z.string().nullable().optional(),
          threadId: z.string().nullable().optional(),
          topicId: z.string(),
        }),
        expanded: z.boolean().optional(),
        messageGroupId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { messageGroupId, expanded, context } = input;

      return ctx.messageService.updateMessageGroupMetadata(messageGroupId, { expanded }, context);
    }),

  updateMessagePlugin: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: UpdateMessagePluginSchema.partial(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateMessagePlugin(id, value, resolved);
    }),

  updateMessageRAG: messageProcedure
    .input(UpdateMessageRAGParamsSchema.extend(basicContextSchema.shape))
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateMessageRAG(id, value, resolved);
    }),

  updateMetadata: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: z.object({}).passthrough(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateMetadata(id, value, resolved);
    }),

  updatePluginError: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: z.object({}).passthrough().nullable(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updatePluginError(id, value, resolved);
    }),

  updatePluginState: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: z.object({}).passthrough(),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updatePluginState(id, value, resolved);
    }),

  updateTTS: messageProcedure
    .input(
      z.object({
        id: z.string(),
        value: z
          .object({
            contentMd5: z.string().optional(),
            file: z.string().optional(),
            voice: z.string().optional(),
          })
          .or(z.literal(false)),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.value === false) {
        return ctx.messageModel.deleteMessageTTS(input.id);
      }

      return ctx.messageModel.updateTTS(input.id, input.value);
    }),

  updateToolArguments: messageProcedure
    .input(
      z
        .object({
          toolCallId: z.string(),
          value: z.union([z.string(), z.record(z.unknown())]),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { toolCallId, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateToolArguments(toolCallId, value, resolved);
    }),

  /**
   * Update tool message with content, metadata, pluginState, and pluginError in a single transaction
   * This prevents race conditions when updating multiple fields
   */
  updateToolMessage: messageProcedure
    .input(
      z
        .object({
          id: z.string(),
          value: z.object({
            content: z.string().optional(),
            metadata: z.object({}).passthrough().optional(),
            pluginError: z.any().optional(),
            pluginState: z.object({}).passthrough().optional(),
          }),
        })
        .extend(basicContextSchema.shape),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, value, agentId, ...options } = input;
      const resolved = await resolveContext({ agentId, ...options }, ctx.serverDB, ctx.userId);

      return ctx.messageService.updateToolMessage(id, value, resolved);
    }),
  updateTranslate: messageProcedure
    .input(
      z.object({
        id: z.string(),
        value: z
          .object({
            content: z.string().optional(),
            from: z.string().optional(),
            to: z.string(),
          })
          .or(z.literal(false)),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.value === false) {
        return ctx.messageModel.deleteMessageTranslate(input.id);
      }

      return ctx.messageModel.updateTranslate(input.id, input.value);
    }),
});
