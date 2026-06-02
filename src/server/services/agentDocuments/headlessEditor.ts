/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { HeadlessLiteXMLOperation } from '@lobehub/editor/headless';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { EMPTY_EDITOR_STATE } from '@/libs/editor/constants';
import { isValidEditorData } from '@/libs/editor/isValidEditorData';

export type AgentDocumentEditorData = Record<string, any>;

export type AgentDocumentLiteXMLOperation =
  | {
      action: 'insert';
      afterId: string;
      litexml: string;
    }
  | {
      action: 'insert';
      beforeId: string;
      litexml: string;
    }
  | {
      action: 'modify';
      litexml: string | string[];
    }
  | {
      action: 'remove';
      id: string;
    };

const orderLiteXMLOperations = (
  operations: AgentDocumentLiteXMLOperation[],
): AgentDocumentLiteXMLOperation[] => {
  const orderedOperations: AgentDocumentLiteXMLOperation[] = [];

  for (const operation of operations) {
    if (operation.action === 'insert') {
      orderedOperations.unshift(operation);
    } else {
      orderedOperations.push(operation);
    }
  }

  return orderedOperations;
};

const toHeadlessLiteXMLOperation = (
  operation: AgentDocumentLiteXMLOperation,
): HeadlessLiteXMLOperation => {
  switch (operation.action) {
    case 'insert': {
      return 'beforeId' in operation
        ? {
            action: 'insert',
            beforeId: operation.beforeId,
            delay: true,
            litexml: operation.litexml,
          }
        : {
            action: 'insert',
            afterId: operation.afterId,
            delay: true,
            litexml: operation.litexml,
          };
    }

    case 'modify': {
      return {
        action: 'replace',
        delay: true,
        litexml: operation.litexml,
      };
    }

    case 'remove': {
      return {
        action: 'remove',
        delay: true,
        id: operation.id,
      };
    }
  }
};

export interface AgentDocumentEditorSnapshot {
  content: string;
  editorData: AgentDocumentEditorData;
  litexml?: string;
}

interface LoadEditorStateParams {
  editorData?: AgentDocumentEditorData | null;
  fallbackContent?: string;
}

const LITEXML_ID_MAX = 1_679_616;
const LITEXML_ID_START = 1_000_000;
const LITEXML_ID_STEP = 7211;

const toNumericId = (id: unknown): number | null => {
  if (typeof id !== 'number' && typeof id !== 'string') return null;

  const numericId = Number(id);

  return Number.isInteger(numericId) && numericId >= 0 ? numericId : null;
};

const toLiteXMLId = (id: unknown): string | null => {
  const numericId = toNumericId(id);

  if (numericId === null) return null;

  return ((numericId * LITEXML_ID_STEP + LITEXML_ID_START) % LITEXML_ID_MAX)
    .toString(36)
    .padStart(4, '0');
};

const collectSerializedNodeIds = (node: unknown, ids: unknown[] = []): unknown[] => {
  if (!node || typeof node !== 'object') return ids;

  const serializedNode = node as { children?: unknown; id?: unknown };

  if (serializedNode.id !== undefined && serializedNode.id !== 'root') {
    ids.push(serializedNode.id);
  }

  if (Array.isArray(serializedNode.children)) {
    for (const child of serializedNode.children) {
      collectSerializedNodeIds(child, ids);
    }
  }

  return ids;
};

const buildLiteXMLIdRemap = (
  previousEditorData: AgentDocumentEditorData,
  currentEditorData: AgentDocumentEditorData,
): Map<string, string> => {
  const previousIds = collectSerializedNodeIds(previousEditorData.root);
  const currentIds = collectSerializedNodeIds(currentEditorData.root);
  const remap = new Map<string, string>();
  const count = Math.min(previousIds.length, currentIds.length);

  for (let index = 0; index < count; index += 1) {
    const from = toLiteXMLId(previousIds[index]);
    const to = toLiteXMLId(currentIds[index]);

    if (from && to && from !== to) {
      remap.set(from, to);
    }
  }

  return remap;
};

const remapLiteXMLId = (id: string, remap: Map<string, string>): string => remap.get(id) ?? id;

const remapLiteXMLIds = (litexml: string, remap: Map<string, string>): string =>
  litexml.replaceAll(/\bid="([^"]+)"/g, (match, id: string) => {
    const nextId = remapLiteXMLId(id, remap);

    return nextId === id ? match : `id="${nextId}"`;
  });

const remapLiteXMLOperation = (
  operation: AgentDocumentLiteXMLOperation,
  remap: Map<string, string>,
): AgentDocumentLiteXMLOperation => {
  if (remap.size === 0) return operation;

  switch (operation.action) {
    case 'insert': {
      if ('beforeId' in operation) {
        return {
          ...operation,
          beforeId: remapLiteXMLId(operation.beforeId, remap),
          litexml: remapLiteXMLIds(operation.litexml, remap),
        };
      }

      return {
        ...operation,
        afterId: remapLiteXMLId(operation.afterId, remap),
        litexml: remapLiteXMLIds(operation.litexml, remap),
      };
    }

    case 'modify': {
      return {
        ...operation,
        litexml: Array.isArray(operation.litexml)
          ? operation.litexml.map((value) => remapLiteXMLIds(value, remap))
          : remapLiteXMLIds(operation.litexml, remap),
      };
    }

    case 'remove': {
      return {
        ...operation,
        id: remapLiteXMLId(operation.id, remap),
      };
    }
  }
};

const exportSnapshot = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  litexml = false,
): AgentDocumentEditorSnapshot => {
  const snapshot = editor.export({ litexml });

  return {
    content: snapshot.markdown,
    editorData: snapshot.editorData as SerializedEditorState<SerializedLexicalNode>,
    litexml: snapshot.litexml,
  };
};

const hydrateMarkdownOrEmptyState = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  content: string,
  options?: { keepId?: boolean },
) => {
  if (content.trim().length === 0) {
    editor.hydrateEditorData(
      EMPTY_EDITOR_STATE as unknown as SerializedEditorState<SerializedLexicalNode>,
      options,
    );
    return;
  }

  editor.hydrateMarkdown(content, options);
};

const loadEditorState = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  { editorData, fallbackContent = '' }: LoadEditorStateParams,
) => {
  if (isValidEditorData(editorData)) {
    editor.hydrateEditorData(
      editorData as unknown as SerializedEditorState<SerializedLexicalNode>,
    );
    return;
  }

  hydrateMarkdownOrEmptyState(editor, fallbackContent, { keepId: true });
};

export const createMarkdownEditorSnapshot = async (
  content: string,
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    hydrateMarkdownOrEmptyState(editor, content);
    return exportSnapshot(editor);
  } finally {
    editor.destroy();
  }
};

export const exportEditorDataSnapshot = async (
  params: LoadEditorStateParams & { litexml?: boolean },
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, params);
    return exportSnapshot(editor, params.litexml);
  } finally {
    editor.destroy();
  }
};

export const applyLiteXMLOperations = async ({
  editorData,
  fallbackContent,
  operations,
}: LoadEditorStateParams & {
  operations: AgentDocumentLiteXMLOperation[];
}): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, { editorData, fallbackContent });
    const idRemap =
      editorData && isValidEditorData(editorData)
        ? buildLiteXMLIdRemap(editorData, exportSnapshot(editor).editorData)
        : new Map<string, string>();

    await editor.applyLiteXML(
      orderLiteXMLOperations(operations)
        .map((operation) => remapLiteXMLOperation(operation, idRemap))
        .map(toHeadlessLiteXMLOperation),
    );
    return exportSnapshot(editor, true);
  } finally {
    editor.destroy();
  }
};
