import {
  type getKernelFromEditor,
  IMarkdownShortCutService,
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
import { type Editor } from '@lobehub/editor/react';
import { $createLineBreakNode, $createTextNode } from 'lexical';
import { type FC, useLayoutEffect } from 'react';

import { ReactActionTagPlugin } from './ActionTag';
import { ReactReferTopicPlugin } from './ReferTopic';

type EditorPlugins = NonNullable<Parameters<typeof Editor>[0]['plugins']>;
type IEditorKernel = ReturnType<typeof getKernelFromEditor>;

class TikzFenceGuardPlugin {
  static pluginName = 'TikzFenceGuardPlugin';

  private kernel: IEditorKernel;

  constructor(kernel: IEditorKernel) {
    this.kernel = kernel;
  }

  onInit(): void {
    const markdownService = this.kernel.requireService(IMarkdownShortCutService);
    if (!markdownService) return;

    // Preserve typed TikZ-like openers as literal source. CodeMirror's shortcut
    // normalizes both the delimiter and language, which would erase eligibility data.
    markdownService.registerMarkdownShortCut({
      regExp: /^(```|···)(.+)?$/,
      replace: (parentNode, _children, match) => {
        const info = match[2] ?? '';
        if (info.toLowerCase() !== 'tikz') return false;

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
