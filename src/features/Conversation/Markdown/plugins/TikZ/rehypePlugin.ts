import { SKIP, visit } from 'unist-util-visit';

export const TIKZ_DIAGRAM_TAG = 'tikz-diagram';

const isTikzFence = (node: any) => {
  const className = node?.properties?.className;

  return Array.isArray(className)
    ? className.includes('language-tikz')
    : className === 'language-tikz';
};

const hasOneCompleteTikzPicture = (source: string) => {
  const begin = String.raw`\begin{tikzpicture}`;
  const end = String.raw`\end{tikzpicture}`;
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);

  return (
    beginIndex >= 0 &&
    endIndex > beginIndex &&
    !source.includes(begin, beginIndex + begin.length) &&
    !source.includes(end, endIndex + end.length)
  );
};

const rehypeTikz = () => (tree: any) => {
  visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
    if (index === undefined || !parent || node.tagName !== 'pre' || node.children?.length !== 1) {
      return;
    }

    const code = node.children[0];
    if (!isTikzFence(code) || code.tagName !== 'code' || code.children?.length !== 1) return;

    const text = code.children[0];
    if (text.type !== 'text' || !hasOneCompleteTikzPicture(text.value)) return;

    parent.children.splice(index, 1, {
      children: [],
      properties: { source: text.value },
      tagName: TIKZ_DIAGRAM_TAG,
      type: 'element',
    });

    return [SKIP, index];
  });
};

export default rehypeTikz;
