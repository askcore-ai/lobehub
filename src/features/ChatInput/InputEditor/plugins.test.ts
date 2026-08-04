/**
 * @vitest-environment happy-dom
 */
import { type IEditor, moment } from '@lobehub/editor';
import { LANGUAGES } from '@lobehub/editor/codemirror';
import { Editor } from '@lobehub/editor/react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot, KEY_ENTER_COMMAND } from 'lexical';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatInputRichPlugins } from './plugins';

beforeEach(() => {
  const instance = {
    blur: vi.fn(),
    destroy: vi.fn(),
    focus: vi.fn(),
    getValue: () => '',
    on: vi.fn(),
    optionHelper: { theme: { reconfigure: vi.fn() } },
    setOption: vi.fn(),
    setSelectionToEnd: vi.fn(),
    view: { constructor: { theme: vi.fn() }, dispatch: vi.fn(), hasFocus: false },
  };
  (window as any).CodeMirror = { default: { fromTextArea: () => instance } };
});

afterEach(() => {
  cleanup();
  delete (window as any).CodeMirror;
});

describe('chat input scientific content', () => {
  it('should preserve an explicit TikZ fence through editor serialization', async () => {
    const markdown =
      '```tikz\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```';
    let editor: IEditor | undefined;

    render(
      createElement(Editor, {
        content: '',
        onInit: (instance: IEditor) => {
          editor = instance;
        },
        plugins: createChatInputRichPlugins({ linkPlugin: false }),
        type: 'text',
        variant: 'chat',
      }),
    );

    await act(async () => {
      await moment();
    });
    await waitFor(() => expect(editor).toBeDefined());

    await act(async () => {
      editor!.setDocument('markdown', markdown);
      await moment();
    });

    const editorData = editor!.getDocument('json') as any;
    const serializedMarkdown = editor!.getDocument('markdown') as unknown as string;

    expect(LANGUAGES).toContainEqual(
      expect.objectContaining({ syntax: 'text/x-stex', value: 'tikz' }),
    );
    expect(editorData.root.children[0]).toMatchObject({
      code: '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
      language: 'tikz',
      type: 'code',
    });
    expect(serializedMarkdown.trim()).toBe(markdown);
  });

  it.each([
    {
      markdown: '```TikZ\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```',
      name: 'case-variant info string',
    },
    {
      markdown:
        '```tikz title=diagram\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```',
      name: 'fence metadata',
    },
  ])('should not normalize $name into an eligible TikZ fence', async ({ markdown }) => {
    let editor: IEditor | undefined;

    render(
      createElement(Editor, {
        content: '',
        onInit: (instance: IEditor) => {
          editor = instance;
        },
        plugins: createChatInputRichPlugins({ linkPlugin: false }),
        type: 'text',
        variant: 'chat',
      }),
    );

    await act(async () => {
      await moment();
    });
    await waitFor(() => expect(editor).toBeDefined());

    await act(async () => {
      editor!.setDocument('markdown', markdown);
      await moment();
    });

    const editorData = editor!.getDocument('json') as any;

    expect(editorData.root.children[0]).not.toMatchObject({ language: 'tikz', type: 'code' });
  });

  it('should keep a typed case-variant fence out of the TikZ code path', async () => {
    let editor: IEditor | undefined;

    render(
      createElement(Editor, {
        content: '',
        onInit: (instance: IEditor) => {
          editor = instance;
        },
        plugins: createChatInputRichPlugins({ linkPlugin: false }),
        type: 'text',
        variant: 'chat',
      }),
    );

    await act(async () => {
      await moment();
    });
    await waitFor(() => expect(editor).toBeDefined());

    await act(async () => {
      const lexicalEditor = editor!.getLexicalEditor()!;
      lexicalEditor.update(() => {
        const paragraph = $createParagraphNode();
        const text = $createTextNode('```TikZ');
        paragraph.append(text);
        $getRoot().clear().append(paragraph);
        text.selectEnd();
      });
      lexicalEditor.dispatchCommand(
        KEY_ENTER_COMMAND,
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );
      await moment();
    });

    const editorData = editor!.getDocument('json') as any;
    const serializedMarkdown = editor!.getDocument('markdown') as unknown as string;

    expect(editorData.root.children[0]).not.toMatchObject({ language: 'tikz', type: 'code' });
    expect(serializedMarkdown).toContain('```TikZ');
  });
});
