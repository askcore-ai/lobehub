'use client';

import { BriefcaseBusiness } from 'lucide-react';
import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ASKCORE_WORKBENCH_PATH } from '@/business/client/AskCoreWorkbench/config';
import NavItem from '@/features/NavPanel/components/NavItem';
import { isModifierClick } from '@/utils/navigation';

const InboxEntry = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.startsWith(ASKCORE_WORKBENCH_PATH);

  return (
    <NavItem
      active={active}
      aria-label="教学工作台"
      href={ASKCORE_WORKBENCH_PATH}
      icon={BriefcaseBusiness}
      title="教学工作台"
      onClick={(e) => {
        if (isModifierClick(e)) return;
        navigate(ASKCORE_WORKBENCH_PATH);
      }}
    />
  );
});

export default InboxEntry;
