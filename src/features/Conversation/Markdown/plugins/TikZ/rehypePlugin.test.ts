import { describe, expect, it } from 'vitest';

import rehypePlugin, { containsCompleteTikzFence, TIKZ_DIAGRAM_TAG } from './rehypePlugin';

describe('TikZ conversation Markdown adapter', () => {
  it('detects only a complete exact fence for rich sent-message routing', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;

    expect(containsCompleteTikzFence(`before\n\n\`\`\`tikz\n${source}\n\`\`\``)).toBe(true);
    expect(containsCompleteTikzFence(`\`\`\`tikz\n${source}`)).toBe(false);
    expect(containsCompleteTikzFence(`\`\`\`latex\n${source}\n\`\`\``)).toBe(false);
    expect(containsCompleteTikzFence(`\`\`\`tikz title=x\n${source}\n\`\`\``)).toBe(false);
  });

  it('routes one exact tikz fence with a complete tikzpicture environment', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const markdown = `\`\`\`tikz\n${source}\n\`\`\``;
    const tree = {
      children: [
        {
          children: [{ children: [{ type: 'text', value: source }], type: 'element' }],
          position: { end: { offset: markdown.length }, start: { offset: 0 } },
          properties: {},
          tagName: 'pre',
          type: 'element',
        },
      ],
      type: 'root',
    } as any;
    tree.children[0].children[0].properties = { className: ['language-tikz'] };
    tree.children[0].children[0].tagName = 'code';

    rehypePlugin()(tree, { value: markdown });

    expect(tree).toEqual({
      children: [
        {
          children: [],
          properties: { source },
          tagName: TIKZ_DIAGRAM_TAG,
          type: 'element',
        },
      ],
      type: 'root',
    });
  });

  it('does not route a code node that declares another fence language', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const markdown = `\`\`\`tikz\n${source}\n\`\`\``;
    const tree = {
      children: [
        {
          children: [
            {
              children: [{ type: 'text', value: source }],
              properties: { className: ['language-tikz', 'language-latex'] },
              tagName: 'code',
              type: 'element',
            },
          ],
          properties: {},
          position: { end: { offset: markdown.length }, start: { offset: 0 } },
          tagName: 'pre',
          type: 'element',
        },
      ],
      type: 'root',
    } as any;
    const original = structuredClone(tree);

    rehypePlugin()(tree, { value: markdown });

    expect(tree).toEqual(original);
  });
});
