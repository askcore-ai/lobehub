import { LexicalRenderer } from '@lobehub/editor/renderer';
import type { MarkdownProps } from '@lobehub/ui';
import type { SerializedEditorState } from 'lexical';
import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import { ActionTagNode } from '@/features/ChatInput/InputEditor/ActionTag/ActionTagNode';
import { mentionFilledClassName } from '@/features/ChatInput/InputEditor/mentionStyle';
import { ReferTopicNode } from '@/features/ChatInput/InputEditor/ReferTopic/ReferTopicNode';
import MarkdownMessage from '@/features/Conversation/Markdown';
import { findCompleteTikzFences } from '@/features/Conversation/Markdown/plugins/TikZ/rehypePlugin';

interface RichTextMessageProps {
  editorState: unknown;
  markdownProps?: Partial<MarkdownProps>;
}

const LINE_HEIGHT = 1.6;
const style: CSSProperties = { '--common-line-height': LINE_HEIGHT } as CSSProperties;
const EXTRA_NODES = [ActionTagNode, ReferTopicNode];

type RichTextChunk =
  { editorState: SerializedEditorState; type: 'rich' } | { markdown: string; type: 'tikz' };

type RichTextPiece =
  | {
      node: Record<string, any>;
      rootChild: Record<string, any>;
      rootIndex: number;
      type: 'child';
    }
  | { rootChild: Record<string, any>; type: 'root' }
  | { markdown: string; type: 'tikz' };

interface MarkdownToken {
  node?: Record<string, any>;
  rootChild?: Record<string, any>;
  rootIndex?: number;
  text: string;
}

export const splitRichTextTikz = (editorState: SerializedEditorState): RichTextChunk[] => {
  const root = editorState.root as Record<string, any>;
  if (!Array.isArray(root.children)) return [{ editorState, type: 'rich' }];

  const pieces: RichTextPiece[] = [];
  let found = false;
  let markdownRun: MarkdownToken[] = [];

  const appendRichRange = (tokens: MarkdownToken[], start: number, end: number) => {
    let offset = 0;
    for (const token of tokens) {
      const tokenStart = offset;
      const tokenEnd = offset + token.text.length;
      offset = tokenEnd;
      if (!token.node || !token.rootChild || token.rootIndex === undefined) continue;

      const sliceStart = Math.max(start, tokenStart) - tokenStart;
      const sliceEnd = Math.min(end, tokenEnd) - tokenStart;
      if (sliceStart >= sliceEnd) continue;

      const node =
        token.node.type === 'text'
          ? { ...token.node, text: token.text.slice(sliceStart, sliceEnd) }
          : token.node;
      pieces.push({ node, rootChild: token.rootChild, rootIndex: token.rootIndex, type: 'child' });
    }
  };

  const flushMarkdownRun = () => {
    if (markdownRun.length === 0) return;

    const markdown = markdownRun.map(({ text }) => text).join('');
    const fences = findCompleteTikzFences(markdown);
    if (fences.length === 0) {
      appendRichRange(markdownRun, 0, markdown.length);
      markdownRun = [];
      return;
    }

    found = true;
    let cursor = 0;
    for (const fence of fences) {
      appendRichRange(markdownRun, cursor, fence.start);
      pieces.push({ markdown: fence.markdown, type: 'tikz' });
      cursor = fence.end;
    }
    appendRichRange(markdownRun, cursor, markdown.length);
    markdownRun = [];
  };

  for (const [rootIndex, rootChild] of (root.children as Record<string, any>[]).entries()) {
    if (!Array.isArray(rootChild.children) || rootChild.children.length === 0) {
      flushMarkdownRun();
      pieces.push({ rootChild, type: 'root' });
      continue;
    }

    for (const node of rootChild.children as Record<string, any>[]) {
      const isText = node.type === 'text' && typeof node.text === 'string';
      const isLineBreak = node.type === 'linebreak';
      if (!isText && !isLineBreak) {
        flushMarkdownRun();
        pieces.push({ node, rootChild, rootIndex, type: 'child' });
        continue;
      }

      const previous = markdownRun.at(-1);
      if (previous?.rootIndex !== undefined && previous.rootIndex !== rootIndex) {
        markdownRun.push({ text: '\n\n' });
      }
      markdownRun.push({
        node,
        rootChild,
        rootIndex,
        text: isText ? node.text : '\n',
      });
    }
  }
  flushMarkdownRun();

  if (!found) return [{ editorState, type: 'rich' }];

  const chunks: RichTextChunk[] = [];
  let pendingRootChildren: Record<string, any>[] = [];
  let pendingChild:
    { nodes: Record<string, any>[]; rootChild: Record<string, any>; rootIndex: number } | undefined;
  const flushChild = () => {
    if (!pendingChild) return;
    pendingRootChildren.push({ ...pendingChild.rootChild, children: pendingChild.nodes });
    pendingChild = undefined;
  };
  const flushRoot = () => {
    flushChild();
    if (pendingRootChildren.length === 0) return;
    chunks.push({
      editorState: {
        ...editorState,
        root: { ...root, children: pendingRootChildren },
      } as SerializedEditorState,
      type: 'rich',
    });
    pendingRootChildren = [];
  };

  for (const piece of pieces) {
    if (piece.type === 'tikz') {
      flushRoot();
      chunks.push(piece);
      continue;
    }
    if (piece.type === 'root') {
      flushChild();
      pendingRootChildren.push(piece.rootChild);
      continue;
    }
    if (pendingChild?.rootIndex !== piece.rootIndex) {
      flushChild();
      pendingChild = { nodes: [], rootChild: piece.rootChild, rootIndex: piece.rootIndex };
    }
    pendingChild.nodes.push(piece.node);
  }
  flushRoot();
  return chunks;
};

const renderRichText = (value: SerializedEditorState, key?: number) => (
  <LexicalRenderer
    className={mentionFilledClassName}
    extraNodes={EXTRA_NODES}
    key={key}
    style={style}
    value={value}
    variant="chat"
  />
);

const RichTextMessage = memo<RichTextMessageProps>(({ editorState, markdownProps }) => {
  const value = useMemo(() => {
    if (!editorState || typeof editorState !== 'object') return null;
    if (Object.keys(editorState as Record<string, unknown>).length === 0) return null;
    return editorState as SerializedEditorState;
  }, [editorState]);
  const chunks = useMemo(() => (value ? splitRichTextTikz(value) : []), [value]);

  if (!value) return null;
  if (chunks.length === 1 && chunks[0].type === 'rich') {
    return renderRichText(chunks[0].editorState);
  }

  return (
    <>
      {chunks.map((chunk, index) =>
        chunk.type === 'rich' ? (
          renderRichText(chunk.editorState, index)
        ) : (
          <MarkdownMessage {...markdownProps} key={index}>
            {chunk.markdown}
          </MarkdownMessage>
        ),
      )}
    </>
  );
});

RichTextMessage.displayName = 'RichTextMessage';

export default RichTextMessage;
