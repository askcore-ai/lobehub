import { getBuiltinRender } from '@lobechat/builtin-tools/renders';
import { getBuiltinStreaming } from '@lobechat/builtin-tools/streamings';
import { LOADING_FLAT } from '@lobechat/const';
import { AccordionItem, Flexbox, Skeleton } from '@lobehub/ui';
import { Divider } from 'antd';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useState } from 'react';

import SafeBoundary from '@/components/ErrorBoundary';
import dynamic from '@/libs/next/dynamic';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/slices/operation/selectors';
import { useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';

import { dataSelectors, useConversationStore } from '../../../store';
import { redactSkillToolResultForDisplay } from '../toolRenderRules';
import Actions from './Actions';
import Inspectors from './Inspector';

const Debug = dynamic(() => import('./Debug'), {
  loading: () => <Skeleton.Block active height={300} width={'100%'} />,
  ssr: false,
});

const Detail = dynamic(() => import('./Detail'), {
  loading: () => <Skeleton.Block active height={120} width={'100%'} />,
  ssr: false,
});

export interface GroupToolProps {
  assistantMessageId: string;
  disableEditing?: boolean;
  id: string;
}

const Tool = memo<GroupToolProps>(({ assistantMessageId, disableEditing, id }) => {
  // Subscribe directly to this tool's data so a streaming chunk that only
  // updates a sibling tool does not push new props through this subtree.
  const tool = useConversationStore(dataSelectors.getToolInBlock(assistantMessageId, id), isEqual);

  // Stable defaults so downstream hook ordering is preserved even on the brief
  // window where the tool is not yet present in the store snapshot.
  const apiName = tool?.apiName ?? '';
  const identifier = tool?.identifier ?? '';
  const requestArgs = tool?.arguments;
  const intervention = tool?.intervention;
  const result = tool?.result;
  const type = tool?.type;
  const toolMessageId = tool?.result_msg_id;

  const renderDisplayControl = useToolStore(
    toolSelectors.getRenderDisplayControl(identifier, apiName),
  );
  const [showDebug, setShowDebug] = useState(false);
  const [showToolRender, setShowToolRender] = useState(false);
  const [showCustomToolRender, setShowCustomToolRender] = useState(true);

  const isPending = intervention?.status === 'pending';
  const isReject = intervention?.status === 'rejected';
  const isAbort = intervention?.status === 'aborted';
  const needExpand = renderDisplayControl !== 'collapsed' || isPending;
  const isAlwaysExpand = renderDisplayControl === 'alwaysExpand';

  let isArgumentsStreaming = false;
  try {
    JSON.parse(requestArgs || '{}');
  } catch {
    isArgumentsStreaming = true;
  }

  const hasStreamingRenderer = !!getBuiltinStreaming(identifier, apiName);
  const forceShowStreamingRender = isArgumentsStreaming && hasStreamingRenderer;

  const isToolCallingFromOperation = useChatStore(
    operationSelectors.isMessageInToolCalling(assistantMessageId),
  );
  const isAssistantMessageBusy = useChatStore(
    operationSelectors.isMessageProcessing(assistantMessageId),
  );

  const hasError = !!result?.error;
  const hasFinishedResult =
    hasError || (!!result && result.content !== LOADING_FLAT && !!result.content);
  const looksLikeWaitingForToolResult = !hasError && !isArgumentsStreaming && !hasFinishedResult;
  const isToolCallingFallback = looksLikeWaitingForToolResult && isAssistantMessageBusy;
  const isToolCalling = !hasFinishedResult && (isToolCallingFromOperation || isToolCallingFallback);
  const toolCallStartTime = useChatStore(operationSelectors.getRunningToolCallStartTime(id));

  const hasCustomRender = !!getBuiltinRender(identifier, apiName);
  const canToggleCustomToolRender = hasCustomRender && !isPending && !isReject && !isAbort;
  const displayResult = redactSkillToolResultForDisplay({
    apiName,
    identifier,
    result,
  });

  const handleExpand = (expand?: boolean) => {
    if (isAlwaysExpand && expand === false) return;
    if (expand === false) setShowDebug(false);
    setShowToolRender(!!expand);
  };

  useEffect(() => {
    if (needExpand) {
      setTimeout(() => handleExpand(true), 100);
    }
  }, [needExpand]);

  if (!tool) return null;

  const isToolDetailExpand = forceShowStreamingRender || showToolRender || showDebug;

  return (
    <AccordionItem
      expand={isToolDetailExpand}
      hideIndicator={isAlwaysExpand}
      itemKey={id}
      paddingBlock={4}
      paddingInline={4}
      action={
        !disableEditing && (
          <Actions
            assistantMessageId={assistantMessageId}
            canToggleCustomToolRender={canToggleCustomToolRender}
            identifier={identifier}
            setShowCustomToolRender={setShowCustomToolRender}
            setShowDebug={setShowDebug}
            showCustomToolRender={showCustomToolRender}
            showDebug={showDebug}
          />
        )
      }
      title={
        <Inspectors
          apiName={apiName}
          arguments={requestArgs}
          identifier={identifier}
          intervention={intervention}
          isArgumentsStreaming={isArgumentsStreaming}
          isToolCalling={isToolCalling}
          result={displayResult}
          toolCallId={id}
          toolCallStartTime={toolCallStartTime}
        />
      }
      onExpandChange={handleExpand}
    >
      <Flexbox gap={8} paddingBlock={8}>
        {showDebug && (
          <Debug
            apiName={apiName}
            identifier={identifier}
            intervention={intervention}
            requestArgs={requestArgs}
            result={displayResult}
            toolCallId={id}
            type={type}
          />
        )}
        <SafeBoundary alertTitle={`${identifier} / ${apiName}`} variant="alert">
          <Detail
            apiName={apiName}
            arguments={requestArgs}
            disableEditing={disableEditing}
            identifier={identifier}
            intervention={intervention}
            isArgumentsStreaming={isArgumentsStreaming}
            isToolCalling={isToolCalling}
            messageId={assistantMessageId}
            result={displayResult}
            showCustomToolRender={showCustomToolRender}
            toolCallId={id}
            toolMessageId={toolMessageId}
            type={type}
          />
        </SafeBoundary>
        <Divider dashed style={{ marginBottom: 0, marginTop: 8 }} />
      </Flexbox>
    </AccordionItem>
  );
});

Tool.displayName = 'GroupTool';

export default Tool;
