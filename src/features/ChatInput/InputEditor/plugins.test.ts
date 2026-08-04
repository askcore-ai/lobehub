import './plugins';

import { LANGUAGES } from '@lobehub/editor/codemirror';
import { createHeadlessEditor } from '@lobehub/editor/headless';
import { afterEach, describe, expect, it } from 'vitest';

const editors: ReturnType<typeof createHeadlessEditor>[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors.length = 0;
});

describe('chat input scientific content', () => {
  it('should preserve an explicit TikZ fence through editor serialization', () => {
    const markdown =
      '```tikz\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n```';
    const editor = createHeadlessEditor().hydrateMarkdown(markdown);
    editors.push(editor);

    const exported = editor.export();

    expect(LANGUAGES).toContainEqual(
      expect.objectContaining({ syntax: 'text/x-stex', value: 'tikz' }),
    );
    expect(exported.editorData.root.children[0]).toMatchObject({
      code: '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
      language: 'tikz',
      type: 'code',
    });
    expect(exported.markdown.trim()).toBe(markdown);
  });
});
