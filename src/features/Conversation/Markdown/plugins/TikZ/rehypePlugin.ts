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

export interface CompleteTikzFence {
  end: number;
  markdown: string;
  source: string;
  start: number;
}

export const findCompleteTikzFences = (markdown: string): CompleteTikzFence[] => {
  const lines: { content: string; end: number; next: number; start: number }[] = [];

  for (let start = 0; start <= markdown.length;) {
    const newline = markdown.indexOf('\n', start);
    const end = newline === -1 ? markdown.length : newline;
    lines.push({
      content: markdown.slice(start, end).replace(/\r$/, ''),
      end,
      next: newline === -1 ? markdown.length : newline + 1,
      start,
    });
    if (newline === -1) break;
    start = newline + 1;
  }

  const fences: CompleteTikzFence[] = [];
  let opening: { bodyStart: number; info: string; markerLength: number; start: number } | undefined;

  for (const line of lines) {
    if (!opening) {
      const match = /^(`{3,})([^`]*)$/.exec(line.content);
      if (match) {
        opening = {
          bodyStart: line.next,
          info: match[2],
          markerLength: match[1].length,
          start: line.start,
        };
      }
      continue;
    }

    const closing = /^(`{3,})[\t ]*$/.exec(line.content);
    if (!closing || closing[1].length < opening.markerLength) continue;

    if (
      opening.markerLength === 3 &&
      closing[1].length === 3 &&
      /^tikz[\t ]*$/.test(opening.info)
    ) {
      const source = markdown.slice(opening.bodyStart, line.start).replace(/\r?\n$/, '');
      if (hasOneCompleteTikzPicture(source)) {
        fences.push({
          end: line.end,
          markdown: markdown.slice(opening.start, line.end),
          source,
          start: opening.start,
        });
      }
    }

    opening = undefined;
  }

  return fences;
};

const hasCompleteOuterFence = (node: any, file: any) => {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;

  const markdown = String(file?.value ?? '').slice(start, end);
  const fences = findCompleteTikzFences(markdown);

  return fences.length === 1 && fences[0].start === 0 && fences[0].end === markdown.length;
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
