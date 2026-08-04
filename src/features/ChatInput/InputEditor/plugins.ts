import {
  type getKernelFromEditor,
  IMarkdownShortCutService,
  MARKDOWN_READER_LEVEL_HIGH,
  ReactCodemirrorPlugin,
  ReactCodePlugin,
  ReactHRPlugin,
  ReactLinkHighlightPlugin,
  ReactListPlugin,
  ReactMathPlugin,
  ReactMentionPlugin,
  ReactVirtualBlockPlugin,
  useLexicalComposerContext,
} from '@lobehub/editor';
import { LANGUAGES } from '@lobehub/editor/codemirror';
import { type Editor } from '@lobehub/editor/react';
import { $createLineBreakNode, $createTextNode } from 'lexical';
import { type FC, useLayoutEffect } from 'react';

import { ReactActionTagPlugin } from './ActionTag';
import { ReactReferTopicPlugin } from './ReferTopic';

type EditorPlugins = NonNullable<Parameters<typeof Editor>[0]['plugins']>;
type IEditorKernel = ReturnType<typeof getKernelFromEditor>;

if (!LANGUAGES.some(({ value }) => value === 'tikz')) {
  LANGUAGES.push({ name: 'TikZ', syntax: 'text/x-stex', value: 'tikz' });
}

class TikzFenceGuardPlugin {
  static pluginName = 'TikzFenceGuardPlugin';

  private kernel: IEditorKernel;

  constructor(kernel: IEditorKernel) {
    this.kernel = kernel;
  }

  onInit(): void {
    const markdownService = this.kernel.requireService(IMarkdownShortCutService);
    if (!markdownService) return;

    // The upstream CodeMirror reader normalizes language case and drops fence metadata.
    // Reject TikZ-like variants before that lossy conversion can make them look eligible.
    markdownService.registerMarkdownReader(
      'code',
      (node) => {
        const hasMetadata = node.meta !== null && node.meta !== undefined;
        if (node.lang?.toLowerCase() === 'tikz' && (node.lang !== 'tikz' || hasMetadata)) {
          node.lang = 'plain';
        }
        return false;
      },
      MARKDOWN_READER_LEVEL_HIGH,
    );

    markdownService.registerMarkdownShortCut({
      regExp: /^(```|···)(.+)?$/,
      replace: (parentNode, _children, match) => {
        const info = match[2] ?? '';
        if (info.toLowerCase() !== 'tikz' || info === 'tikz') return false;

        parentNode.append($createTextNode(match[0]), $createLineBreakNode());
        parentNode.selectEnd();
      },
      trigger: 'enter',
      type: 'element',
    });
  }
}

const ReactTikzFenceGuardPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editor.registerPlugin(TikzFenceGuardPlugin);
  }, [editor]);

  return null;
};

ReactTikzFenceGuardPlugin.displayName = 'ReactTikzFenceGuardPlugin';

interface CreateChatInputRichPluginsOptions {
  linkPlugin?: EditorPlugins[number] | false;
  mathPlugin?: EditorPlugins[number];
}

export const CHAT_INPUT_EMBED_PLUGINS: EditorPlugins = [
  ReactActionTagPlugin,
  ReactReferTopicPlugin,
  ReactMentionPlugin,
];

export const createChatInputRichPlugins = ({
  linkPlugin = ReactLinkHighlightPlugin,
  mathPlugin = ReactMathPlugin,
}: CreateChatInputRichPluginsOptions = {}): EditorPlugins => [
  ReactListPlugin,
  ReactCodePlugin,
  ReactTikzFenceGuardPlugin,
  ReactCodemirrorPlugin,
  ReactHRPlugin,
  ...(linkPlugin ? [linkPlugin] : []),
  ReactVirtualBlockPlugin,
  mathPlugin,
  ...CHAT_INPUT_EMBED_PLUGINS,
];
