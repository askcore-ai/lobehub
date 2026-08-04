/**
 * @vitest-environment happy-dom
 */
import { type IEditor, moment } from '@lobehub/editor';
import { Editor } from '@lobehub/editor/react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { splitRichTextTikz } from '@/features/Conversation/Messages/User/components/RichTextMessage';

import { createChatInputRichPlugins } from './plugins';

const TIKZ_BODY = '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';

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

const renderChatEditor = async () => {
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

  return editor!;
};

const typeOpeningShortcut = async (editor: IEditor, opening: string) => {
  const lexicalEditor = editor.getLexicalEditor()!;

  await act(async () => {
    lexicalEditor.update(() => {
      const paragraph = $createParagraphNode();
      const text = $createTextNode(opening);
      paragraph.append(text);
      $getRoot().clear().append(paragraph);
      text.selectEnd();
    });
    await moment();
  });

  await act(async () => {
    const handled = lexicalEditor.dispatchCommand(
      KEY_ENTER_COMMAND,
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(handled).toBe(true);
    await moment();
  });
};

describe('chat input scientific content', () => {
  it('should preserve a typed exact TikZ fence as literal Markdown', async () => {
    const editor = await renderChatEditor();
    const markdown = `\`\`\`tikz\n${TIKZ_BODY}\n\`\`\``;

    await typeOpeningShortcut(editor, '```tikz');

    const editorDataAfterOpening = editor.getDocument('json') as any;
    expect(editorDataAfterOpening.root.children[0]).toMatchObject({ type: 'paragraph' });
    expect(editorDataAfterOpening.root.children[0].children).toMatchObject([
      { text: '```tikz', type: 'text' },
      { type: 'linebreak' },
    ]);

    await act(async () => {
      editor.getLexicalEditor()!.update(() => {
        const paragraph = $getRoot().getFirstChild();
        if (!$isElementNode(paragraph)) throw new Error('Expected chat input paragraph');
        paragraph.append(
          $createTextNode('\\begin{tikzpicture}'),
          $createLineBreakNode(),
          $createTextNode('\\draw (0,0) -- (1,1);'),
          $createLineBreakNode(),
          $createTextNode('\\end{tikzpicture}'),
          $createLineBreakNode(),
          $createTextNode('```'),
        );
      });
      await moment();
    });

    const editorData = editor.getDocument('json') as any;
    expect((editor.getDocument('markdown') as unknown as string).trim()).toBe(markdown);
    expect(splitRichTextTikz(editorData).map(({ type }) => type)).toEqual(['tikz']);
  });

  it.each([
    { closing: '```', opening: '```TikZ', name: 'case-variant info string' },
    { closing: '```', opening: '```tikz title=diagram', name: 'fence metadata' },
    { closing: '````', opening: '````tikz', name: 'four-backtick fence' },
    { closing: '~~~', opening: '~~~tikz', name: 'tilde fence' },
  ])('should not normalize $name into an eligible TikZ code node', async ({ closing, opening }) => {
    const editor = await renderChatEditor();

    await act(async () => {
      editor.setDocument('markdown', `${opening}\n${TIKZ_BODY}\n${closing}`);
      await moment();
    });

    const editorData = editor.getDocument('json') as any;
    expect(editorData.root.children[0]).not.toMatchObject({ language: 'tikz', type: 'code' });
  });

  it.each(['```TikZ', '···tikz'])(
    'should keep typed non-canonical opener %s out of the TikZ code path',
    async (opening) => {
      const editor = await renderChatEditor();

      await typeOpeningShortcut(editor, opening);

      const editorData = editor.getDocument('json') as any;
      expect(editorData.root.children[0]).not.toMatchObject({ language: 'tikz', type: 'code' });
      expect(editor.getDocument('markdown') as unknown as string).toContain(opening);
    },
  );
});
