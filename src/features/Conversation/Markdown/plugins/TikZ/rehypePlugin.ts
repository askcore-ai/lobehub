import { SKIP, visit } from 'unist-util-visit';

export const TIKZ_DIAGRAM_TAG = 'tikz-diagram';

const isTikzFence = (node: any) => {
  if (node?.data?.meta !== undefined) return false;

  const className = node?.properties?.className;

  if (!Array.isArray(className)) return className === 'language-tikz';

  return (
    className.filter((value) => String(value).startsWith('language-')).join() === 'language-tikz'
  );
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

const hasCompleteOuterFence = (node: any, file: any) => {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;

  const markdown = String(file?.value ?? '')
    .slice(start, end)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
  const lines = markdown.split('\n');

  return /^```tikz[\t ]*$/.test(lines[0]) && /^```[\t ]*$/.test(lines.at(-1) ?? '');
};

const rehypeTikz = () => (tree: any, file: any) => {
  visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
    if (index === undefined || !parent || node.tagName !== 'pre' || node.children?.length !== 1) {
      return;
    }

    const code = node.children[0];
    if (
      !hasCompleteOuterFence(node, file) ||
      !isTikzFence(code) ||
      code.tagName !== 'code' ||
      code.children?.length !== 1
    )
      return;

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
