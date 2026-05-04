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

  it('should generate basic markdown with title', () => {
    const result = generateMarkdown(defaultParams);

    expect(result).toContain('# Chat Title');
    expect(result).toContain('Hello');
    expect(result).toContain('Hi there');
  });

  it('should include system role when withSystemRole is true', () => {
    const systemRole = 'I am a helpful assistant';
    const result = generateMarkdown({
      ...defaultParams,
      withSystemRole: true,
      systemRole,
    });

    expect(result).toContain('````md\nI am a helpful assistant\n````');
  });

  it('should not include system role when withSystemRole is false', () => {
    const systemRole = 'I am a helpful assistant';
    const result = generateMarkdown({
      ...defaultParams,
      withSystemRole: false,
      systemRole,
    });

    expect(result).not.toContain('```\nI am a helpful assistant\n```');
  });

  it('should add role labels when withRole is true', () => {
    const result = generateMarkdown({
      ...defaultParams,
      withRole: true,
    });

    expect(result).toContain('##### User:');
    expect(result).toContain('##### Assistant:');
  });

  it('should not add role labels when withRole is false', () => {
    const result = generateMarkdown({
      ...defaultParams,
      withRole: false,
    });

    expect(result).not.toContain('##### User:');
    expect(result).not.toContain('##### Assistant:');
  });

  it('should include tool messages when includeTool is true', () => {
    const result = generateMarkdown({
      ...defaultParams,
      includeTool: true,
      withRole: true,
    });

    expect(result).toContain('##### Tools Calling:');
    expect(result).toContain('```json\n{"result": "tool data"}\n```');
  });

  it('should exclude tool messages when includeTool is false', () => {
    const result = generateMarkdown({
      ...defaultParams,
      includeTool: false,
    });

    expect(result).not.toContain('{"result": "tool data"}');
  });

  it('should exclude user messages when includeUser is false', () => {
    const result = generateMarkdown({
      ...defaultParams,
      includeUser: false,
    });

    expect(result).not.toContain('Hello');
    expect(result).toContain('Hi there');
  });

  it('should filter out loading messages', () => {
    const result = generateMarkdown(defaultParams);

    expect(result).not.toContain(LOADING_FLAT);
  });

  it('should include tools data when includeTool is true', () => {
    const result = generateMarkdown({
      ...defaultParams,
      includeTool: true,
    });

    expect(result).toContain('"name": "calculator"');
    expect(result).toContain('"result": "42"');
  });

  it('should redact skill source content from tool exports', () => {
    const result = generateMarkdown({
      ...defaultParams,
      includeTool: true,
      messages: [
        {
          content: 'Message with skill tool',
          createdAt: Date.now(),
          id: 'assistant-skill',
          role: 'assistant',
          tools: [
            {
              apiName: 'activateSkill',
              arguments: '{}',
              id: 'tool-1',
              identifier: 'lobe-skills',
              result: {
                content: 'SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK',
                id: 'result-1',
              },
              type: 'builtin',
            },
          ],
        },
        {
          content: 'SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK',
          createdAt: Date.now(),
          id: 'tool-message',
          plugin: {
            apiName: 'readReference',
            arguments: '{}',
            identifier: 'lobe-skills',
            type: 'builtin',
          },
          role: 'tool',
          tool_call_id: 'tool-1',
        },
      ] as UIChatMessage[],
    });

    expect(result).not.toContain('SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK');
    expect(result).toContain('[Skill content hidden]');
  });

  it('should strip selected skill context from user and system role exports', () => {
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
      ] as UIChatMessage[],
      systemRole:
        '<selected_skill_context>SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK</selected_skill_context>',
      withSystemRole: true,
    });

    expect(result).toContain('Visible request');
    expect(result).not.toContain('SEE5_SENTINEL_SKILL_SOURCE_DO_NOT_LEAK');
  });

  it('should handle empty messages array', () => {
    const result = generateMarkdown({
      ...defaultParams,
      messages: [],
    });

    expect(result).toContain('# Chat Title');
    // Should not throw error and should contain at least the title
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
});
