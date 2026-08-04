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

export const splitRichTextTikz = (editorState: SerializedEditorState): RichTextChunk[] => {
  const root = editorState.root as Record<string, any>;
  if (!Array.isArray(root.children)) return [{ editorState, type: 'rich' }];

  const chunks: RichTextChunk[] = [];
  let found = false;
  let pendingRootChildren: Record<string, any>[] = [];
  const flushRoot = () => {
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

  for (const rootChild of root.children as Record<string, any>[]) {
    if (!Array.isArray(rootChild.children)) {
      pendingRootChildren.push(rootChild);
      continue;
    }

    let childWasSplit = false;
    let pendingChildNodes: Record<string, any>[] = [];
    const flushChild = () => {
      if (pendingChildNodes.length === 0) return;
      pendingRootChildren.push({ ...rootChild, children: pendingChildNodes });
      pendingChildNodes = [];
    };

    for (const node of rootChild.children as Record<string, any>[]) {
      if (node.type !== 'text' || typeof node.text !== 'string') {
        pendingChildNodes.push(node);
        continue;
      }

      const fences = findCompleteTikzFences(node.text);
      if (fences.length === 0) {
        pendingChildNodes.push(node);
        continue;
      }

      found = true;
      childWasSplit = true;
      let cursor = 0;
      for (const fence of fences) {
        const before = node.text.slice(cursor, fence.start);
        if (before) pendingChildNodes.push({ ...node, text: before });
        flushChild();
        flushRoot();
        chunks.push({ markdown: fence.markdown, type: 'tikz' });
        cursor = fence.end;
      }

      const after = node.text.slice(cursor);
      if (after) pendingChildNodes.push({ ...node, text: after });
    }

    if (childWasSplit) flushChild();
    else pendingRootChildren.push(rootChild);
  }

  if (!found) return [{ editorState, type: 'rich' }];
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
