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

const codeNodeEditorState = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'before',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
      {
        code: '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
        codeTheme: 'default',
        language: 'javascript',
        options: { indentWithTabs: false, lineNumbers: false, tabSize: 2 },
        type: 'code',
        version: 1,
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'after',
            type: 'text',
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

const paragraph = (text: string) => ({
  children: [
    {
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
      text,
      type: 'text',
      version: 1,
    },
  ],
  direction: null,
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
});

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

  it('should leave non-TikZ code nodes in the rich-text path', () => {
    expect(splitRichTextTikz(codeNodeEditorState as any).map(({ type }) => type)).toEqual(['rich']);
  });

  it('should not infer TikZ eligibility from a lossy code-node language', () => {
    const editorState = structuredClone(codeNodeEditorState);
    editorState.root.children[1].language = 'tikz';

    expect(splitRichTextTikz(editorState as any).map(({ type }) => type)).toEqual(['rich']);
  });

  it('should route one complete TikZ fence split across paragraph nodes', () => {
    const editorState = {
      root: {
        children: [
          paragraph('```tikz'),
          paragraph('\\begin{tikzpicture}'),
          paragraph('\\draw (0,0) -- (1,1);'),
          paragraph('\\end{tikzpicture}'),
          paragraph('```'),
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    };

    expect(splitRichTextTikz(editorState as any).map(({ type }) => type)).toEqual(['tikz']);
  });

  it.each([
    { name: 'quote root', rootType: 'quote', textFormat: 0, textStyle: '' },
    { name: 'heading root', rootType: 'heading', textFormat: 0, textStyle: '' },
    { name: 'formatted text', rootType: 'paragraph', textFormat: 1, textStyle: '' },
    { name: 'styled text', rootType: 'paragraph', textFormat: 0, textStyle: 'color: red' },
  ])(
    'should keep a fence in $name in the rich-text path',
    ({ rootType, textFormat, textStyle }) => {
      const editorState = structuredClone(mixedTikzEditorState) as any;
      const rootChild = editorState.root.children[0];
      rootChild.type = rootType;
      rootChild.children = [rootChild.children[1]];
      rootChild.children[0].format = textFormat;
      rootChild.children[0].style = textStyle;

      expect(splitRichTextTikz(editorState).map(({ type }) => type)).toEqual(['rich']);
    },
  );
});
