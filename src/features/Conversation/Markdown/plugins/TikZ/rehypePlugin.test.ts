import { describe, expect, it } from 'vitest';

import rehypePlugin, { TIKZ_DIAGRAM_TAG } from './rehypePlugin';

describe('TikZ conversation Markdown adapter', () => {
  it('routes one exact tikz fence with a complete tikzpicture environment', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const tree = {
      children: [
        {
          children: [{ children: [{ type: 'text', value: source }], type: 'element' }],
          properties: {},
          tagName: 'pre',
          type: 'element',
        },
      ],
      type: 'root',
    } as any;
    tree.children[0].children[0].properties = { className: ['language-tikz'] };
    tree.children[0].children[0].tagName = 'code';

    rehypePlugin()(tree);

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
          tagName: 'pre',
          type: 'element',
        },
      ],
      type: 'root',
    } as any;
    const original = structuredClone(tree);

    rehypePlugin()(tree);

    expect(tree).toEqual(original);
  });
});
