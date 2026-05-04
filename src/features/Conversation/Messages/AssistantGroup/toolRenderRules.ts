import { ActivatorApiName, LobeActivatorIdentifier } from '@lobechat/builtin-tool-activator';
import { SkillsApiName, SkillsIdentifier } from '@lobechat/builtin-tool-skills';
import {
  WebOnboardingApiName,
  WebOnboardingIdentifier,
} from '@lobechat/builtin-tool-web-onboarding';
import type {
  ChatPluginPayload,
  ChatToolPayload,
  ChatToolPayloadWithResult,
  ChatToolResult,
  UIChatMessage,
} from '@lobechat/types';

interface ToolRenderRuleTarget {
  apiName: string;
  identifier: string;
}

type ToolIdentity = Pick<ToolRenderRuleTarget, 'apiName' | 'identifier'>;

const LegacySkillsIdentifier = 'lobe-tools';
const SELECTED_SKILL_CONTEXT_REGEX =
  /\n*<selected_skill_context>[\S\s]*?<\/selected_skill_context>\n*/g;
const EMPTY_SELECTED_SKILL_CONTEXT_WRAPPER_REGEX =
  /\n*<!-- SYSTEM CONTEXT \(NOT PART OF USER QUERY\) -->\s*<context\.instruction>[\S\s]*?<\/context\.instruction>\s*<!-- END SYSTEM CONTEXT -->\n*/g;

export const SKILL_TOOL_REDACTED_CONTENT = '[Skill content hidden]';

export const isSkillSourceDisclosureTool = ({ apiName, identifier }: ToolRenderRuleTarget) => {
  if (identifier === SkillsIdentifier) {
    return apiName === SkillsApiName.activateSkill || apiName === SkillsApiName.readReference;
  }

  if (identifier === LobeActivatorIdentifier) {
    return apiName === ActivatorApiName.activateSkill;
  }

  if (identifier === LegacySkillsIdentifier) {
    return apiName === SkillsApiName.activateSkill;
  }

  return false;
};

const isActivatorFallbackWithSkills = (
  target: ToolRenderRuleTarget,
  result?: ChatToolResult | null,
) => {
  if (
    target.identifier !== LobeActivatorIdentifier ||
    target.apiName !== ActivatorApiName.activateTools
  ) {
    return false;
  }

  return Array.isArray(result?.state?.activatedSkills) && result.state.activatedSkills.length > 0;
};

export const shouldRedactSkillToolResult = (
  target: ToolRenderRuleTarget,
  result?: ChatToolResult | null,
) => isSkillSourceDisclosureTool(target) || isActivatorFallbackWithSkills(target, result);

export const stripSelectedSkillContextForDisplay = <T>(content: T): T => {
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
        text: stripSelectedSkillContextForDisplay(part.text),
      };
    }) as T;
  }

  return content;
};

export const redactSkillToolResultForDisplay = <T extends ChatToolResult | undefined | null>({
  apiName,
  identifier,
  result,
}: ToolIdentity & { result?: T }): T => {
  if (!result || !shouldRedactSkillToolResult({ apiName, identifier }, result)) return result as T;

  return {
    ...result,
    content: SKILL_TOOL_REDACTED_CONTENT,
  } as T;
};

const redactToolPayloadForDisplay = <T extends ChatToolPayloadWithResult | ChatToolPayload>(
  tool: T,
): T => {
  const toolWithResult = tool as ChatToolPayloadWithResult;
  if (!toolWithResult?.result) return tool;

  return {
    ...tool,
    result: redactSkillToolResultForDisplay({
      apiName: tool.apiName,
      identifier: tool.identifier,
      result: toolWithResult.result,
    }),
  };
};

export const redactSkillMessageForDisplay = <T extends UIChatMessage | Record<string, any>>(
  message: T,
): T => {
  if (!message || typeof message !== 'object') return message;

  const plugin = (message as { plugin?: ChatPluginPayload }).plugin;
  const nextMessage: Record<string, any> = {
    ...message,
    content: stripSelectedSkillContextForDisplay((message as { content?: unknown }).content),
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
    nextMessage.tools = nextMessage.tools.map(redactToolPayloadForDisplay);
  }

  for (const key of ['children', 'compressedMessages', 'pinnedMessages']) {
    if (Array.isArray(nextMessage[key])) {
      nextMessage[key] = nextMessage[key].map(redactSkillMessageForDisplay);
    }
  }

  return nextMessage as T;
};

export const shouldRenderToolCall = ({ apiName, identifier }: ToolRenderRuleTarget) => {
  // This call immediately ends onboarding and switches the UI to the completion state.
  if (identifier === WebOnboardingIdentifier && apiName === WebOnboardingApiName.finishOnboarding) {
    return false;
  }

  return true;
};
