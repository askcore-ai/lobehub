'use client';

import { BriefcaseBusiness } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ASKCORE_WORKBENCH_PATH } from '@/business/client/AskCoreWorkbench/config';
import NavItem from '@/features/NavPanel/components/NavItem';
import { isModifierClick } from '@/utils/navigation';
import { prefetchRoute } from '@/utils/router';

interface InboxItemProps {
  className?: string;
  style?: CSSProperties;
}

const InboxItem = memo<InboxItemProps>(({ className, style }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname.startsWith(ASKCORE_WORKBENCH_PATH);

  prefetchRoute(ASKCORE_WORKBENCH_PATH);

  return (
    <NavItem
      active={active}
      aria-label="教学工作台"
      className={className}
      href={ASKCORE_WORKBENCH_PATH}
      icon={BriefcaseBusiness}
      style={style}
      title="教学工作台"
      onClick={(e) => {
        if (isModifierClick(e)) return;
        navigate(ASKCORE_WORKBENCH_PATH);
      }}
    />
  );
});

export default InboxItem;
