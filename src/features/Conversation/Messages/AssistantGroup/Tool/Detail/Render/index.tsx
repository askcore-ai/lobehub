import { getBuiltinRender } from '@lobechat/builtin-tools/renders';
import { type ChatPluginPayload } from '@lobechat/types';
import { memo } from 'react';

import AskCoreWorkbenchToolCta from '@/business/client/AskCoreWorkbench/AskCoreWorkbenchToolCta';

import CustomRender from './CustomRender';
import { FallbackArgumentRender } from './FallbacktArgumentRender';

interface ToolRenderProps {
  content: string;
  messageId?: string;
  plugin?: ChatPluginPayload;
  pluginState?: any;
  showCustomToolRender?: boolean;
  toolCallId: string;
}

const ToolRender = memo<ToolRenderProps>(
  ({ showCustomToolRender, content, messageId, plugin, pluginState, toolCallId }) => {
    const hasCustomRender = !!getBuiltinRender(plugin?.identifier, plugin?.apiName);

    if (hasCustomRender && showCustomToolRender) {
      return (
        <>
          <AskCoreWorkbenchToolCta plugin={plugin} pluginState={pluginState} />
          <CustomRender
            content={content}
            messageId={messageId}
            plugin={plugin}
            pluginState={pluginState}
            toolCallId={toolCallId}
          />
        </>
      );
    }

    return (
      <>
        <AskCoreWorkbenchToolCta plugin={plugin} pluginState={pluginState} />
        <FallbackArgumentRender
          content={content}
          requestArgs={plugin?.arguments}
          toolCallId={toolCallId}
        />
      </>
    );
  },
);

ToolRender.displayName = 'ToolResultRender';

export default ToolRender;
