/**
 * @vitest-environment happy-dom
 */
import { type IEditor, moment } from '@lobehub/editor';
import { LANGUAGES } from '@lobehub/editor/codemirror';
import { Editor } from '@lobehub/editor/react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
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
});
