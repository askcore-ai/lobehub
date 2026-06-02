import {
  WebOnboardingApiName,
  WebOnboardingIdentifier,
} from '@lobechat/builtin-tool-web-onboarding';
import { describe, expect, it } from 'vitest';

import {
  redactSkillMessageForDisplay,
  redactSkillToolResultForDisplay,
  shouldRenderToolCall,
  SKILL_TOOL_REDACTED_CONTENT,
  stripSelectedSkillContextForDisplay,
} from './toolRenderRules';

describe('shouldRenderToolCall', () => {
  it('hides the onboarding completion tool call', () => {
    expect(
      shouldRenderToolCall({
        apiName: WebOnboardingApiName.finishOnboarding,
        identifier: WebOnboardingIdentifier,
      }),
    ).toBe(false);
  });

  it('keeps other onboarding tool calls visible', () => {
    expect(
      shouldRenderToolCall({
        apiName: WebOnboardingApiName.saveUserQuestion,
        identifier: WebOnboardingIdentifier,
      }),
    ).toBe(true);
  });

  it('keeps non-onboarding tool calls visible', () => {
    expect(
      shouldRenderToolCall({
        apiName: 'search',
        identifier: 'lobe-web-browsing',
      }),
    ).toBe(true);
  });
});

describe('skill source redaction', () => {
  const sentinel = 'SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK';

  it('redacts direct skill activation and reference results for display', () => {
    expect(
      redactSkillToolResultForDisplay({
        apiName: 'activateSkill',
        identifier: 'lobe-skills',
        result: { content: sentinel, id: 'result-1' },
      })?.content,
    ).toBe(SKILL_TOOL_REDACTED_CONTENT);

    expect(
      redactSkillToolResultForDisplay({
        apiName: 'readReference',
        identifier: 'lobe-skills',
        result: { content: sentinel, id: 'result-2' },
      })?.content,
    ).toBe(SKILL_TOOL_REDACTED_CONTENT);
  });

  it('redacts embedded assistant tool results without changing ordinary tools', () => {
    const message = redactSkillMessageForDisplay({
      content: 'assistant response',
      createdAt: Date.now(),
      id: 'assistant-1',
      role: 'assistant',
      tools: [
        {
          apiName: 'activateSkill',
          arguments: '{}',
          id: 'tool-1',
          identifier: 'lobe-skills',
          result: { content: sentinel, id: 'result-1' },
          type: 'builtin',
        },
        {
          apiName: 'search',
          arguments: '{}',
          id: 'tool-2',
          identifier: 'lobe-web-browsing',
          result: { content: 'public result', id: 'result-2' },
          type: 'builtin',
        },
      ],
      updatedAt: Date.now(),
    });

    expect(JSON.stringify(message)).not.toContain(sentinel);
    expect(message.tools?.[0].result?.content).toBe(SKILL_TOOL_REDACTED_CONTENT);
    expect(message.tools?.[1].result?.content).toBe('public result');
  });

  it('redacts persisted tool messages and compressed children', () => {
    const message = redactSkillMessageForDisplay({
      children: [
        {
          content: sentinel,
          id: 'tool-child',
          plugin: {
            apiName: 'readReference',
            arguments: '{}',
            identifier: 'lobe-skills',
            type: 'builtin',
          },
          pluginState: { path: 'SKILL.md' },
          role: 'tool',
        },
      ],
      compressedMessages: [
        {
          content: sentinel,
          id: 'tool-compressed',
          plugin: {
            apiName: 'activateSkill',
            arguments: '{}',
            identifier: 'lobe-skills',
            type: 'builtin',
          },
          role: 'tool',
        },
      ],
      content: sentinel,
      id: 'tool-parent',
      plugin: {
        apiName: 'activateSkill',
        arguments: '{}',
        identifier: 'lobe-skills',
        type: 'builtin',
      },
      role: 'tool',
    });

    expect(JSON.stringify(message)).not.toContain(sentinel);
    expect(message.content).toBe(SKILL_TOOL_REDACTED_CONTENT);
    expect(message.children[0].content).toBe(SKILL_TOOL_REDACTED_CONTENT);
    expect(message.compressedMessages[0].content).toBe(SKILL_TOOL_REDACTED_CONTENT);
  });

  it('strips selected skill context from user-visible text', () => {
    const content = stripSelectedSkillContextForDisplay(`User request

<!-- SYSTEM CONTEXT (NOT PART OF USER QUERY) -->
<context.instruction>private context</context.instruction>
<selected_skill_context>
${sentinel}
</selected_skill_context>
<!-- END SYSTEM CONTEXT -->`);

    expect(content).toBe('User request');
    expect(content).not.toContain(sentinel);
  });

  it('leaves ordinary text whitespace unchanged', () => {
    const content = stripSelectedSkillContextForDisplay('  ordinary user text\n');

    expect(content).toBe('  ordinary user text\n');
  });
});
