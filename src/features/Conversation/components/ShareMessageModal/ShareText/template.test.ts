import { type UIChatMessage } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import { LOADING_FLAT } from '@/const/message';

import { generateMarkdown } from './template';

describe('generateMarkdown', () => {
  // 创建测试用的消息数据
  const mockMessages = [
    {
      id: '1',
      content: 'Hello',
      role: 'user',
      createdAt: Date.now(),
    },
    {
      id: '2',
      content: 'Hi there',
      role: 'assistant',
      createdAt: Date.now(),
    },
    {
      id: '3',
      content: LOADING_FLAT,
      role: 'assistant',
      createdAt: Date.now(),
    },
    {
      id: '4',
      content: '{"result": "tool data"}',
      role: 'tool',
      createdAt: Date.now(),
      tool_call_id: 'tool1',
    },
    {
      id: '5',
      content: 'Message with tools',
      role: 'assistant',
      createdAt: Date.now(),
      tools: [{ name: 'calculator', result: '42' }],
    },
  ] as UIChatMessage[];

  const defaultParams = {
    messages: mockMessages,
    title: 'Chat Title',
    includeTool: false,
    includeUser: true,
    withSystemRole: false,
    withRole: false,
    systemRole: '',
  };

  it('should filter out loading messages', () => {
    const result = generateMarkdown(defaultParams);

    expect(result).not.toContain(LOADING_FLAT);
  });

  it('should handle messages with special characters', () => {
    const messagesWithSpecialChars = [
      {
        id: '1',
        content: '**Bold** *Italic* `Code`',
        role: 'user',
        createdAt: Date.now(),
      },
    ] as UIChatMessage[];

    const result = generateMarkdown({
      ...defaultParams,
      messages: messagesWithSpecialChars,
    });

    expect(result).toContain('**Bold** *Italic* `Code`');
  });

  it('should normalize think tags before exporting markdown', () => {
    const messagesWithThinkTags = [
      {
        id: '1',
        content: 'Intro<think>Reasoning</think>Outro',
        role: 'assistant',
        createdAt: Date.now(),
      },
    ] as UIChatMessage[];

    const result = generateMarkdown({
      ...defaultParams,
      messages: messagesWithThinkTags,
    });

    expect(result).toContain('Intro\n\n<think>\n\nReasoning\n\n</think>\n\nOutro');
  });

  it('should redact skill source content and strip selected skill context', () => {
    const result = generateMarkdown({
      ...defaultParams,
      messages: [
        {
          content: `Visible request

<!-- SYSTEM CONTEXT (NOT PART OF USER QUERY) -->
<context.instruction>private context</context.instruction>
<selected_skill_context>
SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK
</selected_skill_context>
<!-- END SYSTEM CONTEXT -->`,
          createdAt: Date.now(),
          id: 'user-skill-context',
          role: 'user',
        },
        {
          content: 'SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK',
          createdAt: Date.now(),
          id: 'tool-message',
          plugin: {
            apiName: 'activateSkill',
            arguments: '{}',
            identifier: 'lobe-skills',
            type: 'builtin',
          },
          role: 'tool',
          tool_call_id: 'tool-1',
        },
      ] as UIChatMessage[],
    });

    expect(result).toContain('Visible request');
    expect(result).toContain('[Skill content hidden]');
    expect(result).not.toContain('SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK');
  });
});
