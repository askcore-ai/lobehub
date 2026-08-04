/**
 * @vitest-environment happy-dom
 */
import { moment } from '@lobehub/editor';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RichTextMessage, { splitRichTextTikz } from './RichTextMessage';

vi.mock('@/features/Conversation/Markdown', () => ({
  default: ({ children }: any) => <div data-testid="markdown-message">{children}</div>,
}));

const mentionEditorState = {
  root: {
    children: [
      {
        children: [
          {
            label: 'Agent A',
            metadata: { id: 'agent-a', type: 'agent' },
            type: 'mention',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

const mixedTikzEditorState = {
  root: {
    children: [
      {
        children: [
          {
            actionCategory: 'tool',
            actionLabel: 'Notebook',
            actionType: 'lobe-notebook',
            type: 'action-tag',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'before\n```tikz\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```\nafter',
            type: 'text',
            version: 1,
          },
          {
            topicId: 'topic-1',
            topicTitle: 'Topic A',
            type: 'refer-topic',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

afterEach(() => {
  cleanup();
});

describe('RichTextMessage', () => {
  it('should render mention nodes from editor state', async () => {
    const { container } = render(<RichTextMessage editorState={mentionEditorState} />);

    await act(async () => {
      await moment();
    });

    expect(container.querySelector('.editor_mention')?.textContent).toBe('@Agent A');
  });

  it('should render nothing for empty editor state', () => {
    const { container } = render(<RichTextMessage editorState={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should preserve rich nodes around one routed TikZ block', async () => {
    const chunks = splitRichTextTikz(mixedTikzEditorState as any);

    expect(chunks.map(({ type }) => type)).toEqual(['rich', 'tikz', 'rich']);
    expect((chunks[0] as any).editorState.root.children[0].children).toMatchObject([
      { type: 'action-tag' },
      { text: 'before\n', type: 'text' },
    ]);
    expect((chunks[1] as any).markdown).toBe(
      '```tikz\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```',
    );
    expect((chunks[2] as any).editorState.root.children[0].children).toMatchObject([
      { text: '\nafter', type: 'text' },
      { type: 'refer-topic' },
    ]);

    const { container, getByTestId } = render(
      <RichTextMessage editorState={mixedTikzEditorState} markdownProps={{}} />,
    );
    await act(async () => {
      await moment();
    });

    expect(getByTestId('markdown-message')).toBeInTheDocument();
    expect(container.textContent).toContain('Notebook');
    expect(container.textContent).toContain('Topic A');
  });
});
