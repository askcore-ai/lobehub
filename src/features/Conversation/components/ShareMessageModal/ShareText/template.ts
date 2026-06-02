import { type UIChatMessage } from '@lobechat/types';

import { LOADING_FLAT } from '@/const/message';
import { redactSkillMessageForDisplay } from '@/features/Conversation/Messages/AssistantGroup/toolRenderRules';
import { normalizeThinkTags, processWithArtifact } from '@/features/Conversation/utils/markdown';

interface MarkdownParams {
  messages: UIChatMessage[];
}

export const generateMarkdown = ({ messages }: MarkdownParams): string =>
  messages
    .filter((m) => m.content !== LOADING_FLAT)
    .map(redactSkillMessageForDisplay)
    .map((message) => normalizeThinkTags(processWithArtifact(message.content)))
    .join('\n\n');
