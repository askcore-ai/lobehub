'use client';

import { memo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

const WorkbenchPortalTitle = memo(() => {
  const view = useChatStore(chatPortalSelectors.currentView);
  if (view?.type !== PortalViewType.Workbench) return <>Workbench</>;

  return <>Workbench</>;
});

export default WorkbenchPortalTitle;
