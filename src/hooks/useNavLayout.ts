import { BriefcaseBusiness, Building2, HomeIcon, SearchIcon, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { askCoreWorkbenchClient } from '@/business/client/AskCoreWorkbench/api';
import { ASKCORE_WORKBENCH_PATH } from '@/business/client/AskCoreWorkbench/config';
import { getRouteById } from '@/config/routes';
import { useGlobalStore } from '@/store/global';
import { SidebarTabKey } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

export interface NavItem {
  hidden?: boolean;
  icon: any;
  isNew?: boolean;
  key: string;
  onClick?: () => void;
  title: string;
  url?: string;
}

export interface NavLayout {
  bottomMenuItems: NavItem[];
  footer: {
    hideGitHub: boolean;
    layout: 'expanded' | 'compact';
    showEvalEntry: boolean;
    showSettingsEntry: boolean;
  };
  topNavItems: NavItem[];
  userPanel: {
    showDataImporter: boolean;
    showMemory: boolean;
  };
}

type AskCoreWorkbenchNavAccess = 'identity_required' | 'learning' | 'loading' | 'teaching';

let cachedAskCoreWorkbenchNavAccess: AskCoreWorkbenchNavAccess | null = null;
let pendingAskCoreWorkbenchNavAccess: Promise<AskCoreWorkbenchNavAccess> | null = null;

const resolveAskCoreWorkbenchNavAccess = async (): Promise<AskCoreWorkbenchNavAccess> => {
  try {
    const profile = await askCoreWorkbenchClient.getEducationProfile();
    if (profile.workbench_mode === 'identity_required') return 'identity_required';
    if (
      profile.workbench_mode === 'student_managed' ||
      profile.workbench_mode === 'student_restricted'
    ) {
      return 'learning';
    }
    return 'teaching';
  } catch {
    return 'teaching';
  }
};

const getAskCoreWorkbenchNavAccess = () => {
  if (cachedAskCoreWorkbenchNavAccess) return Promise.resolve(cachedAskCoreWorkbenchNavAccess);
  pendingAskCoreWorkbenchNavAccess ||= resolveAskCoreWorkbenchNavAccess().then((access) => {
    cachedAskCoreWorkbenchNavAccess = access;
    pendingAskCoreWorkbenchNavAccess = null;
    return access;
  });
  return pendingAskCoreWorkbenchNavAccess;
};

const useAskCoreWorkbenchNavAccess = () => {
  const [access, setAccess] = useState<AskCoreWorkbenchNavAccess>(
    cachedAskCoreWorkbenchNavAccess || 'loading',
  );

  useEffect(() => {
    let active = true;
    void getAskCoreWorkbenchNavAccess().then((nextAccess) => {
      if (active) setAccess(nextAccess);
    });
    return () => {
      active = false;
    };
  }, []);

  return access;
};

export const __resetAskCoreWorkbenchNavAccessForTest = () => {
  cachedAskCoreWorkbenchNavAccess = null;
  pendingAskCoreWorkbenchNavAccess = null;
};

export const useNavLayout = (): NavLayout => {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const { showMarket, hideGitHub } = useServerConfigStore(featureFlagsSelectors);
  const askCoreWorkbenchNavAccess = useAskCoreWorkbenchNavAccess();

  const topNavItems = useMemo(
    () =>
      [
        {
          icon: SearchIcon,
          key: 'search',
          onClick: () => toggleCommandMenu(true),
          title: t('tab.search'),
        },
        {
          icon: HomeIcon,
          key: SidebarTabKey.Home,
          title: t('tab.home'),
          url: '/',
        },
        {
          icon: getRouteById('tasks')!.icon,
          key: SidebarTabKey.Tasks,
          title: t('tab.tasks'),
          url: '/tasks',
        },
        {
          icon: getRouteById('page')!.icon,
          key: SidebarTabKey.Pages,
          title: t('tab.pages'),
          url: '/page',
        },
        {
          icon: Building2,
          key: SidebarTabKey.Organization,
          title: t('tab.organization'),
          url: '/organization',
        },
        {
          hidden: askCoreWorkbenchNavAccess !== 'identity_required',
          icon: UserCheck,
          key: 'askcore-identity-claim',
          title: t('tab.askcoreIdentityClaim'),
          url: '/organization?action=identity-claim',
        },
        {
          hidden: !['learning', 'teaching'].includes(askCoreWorkbenchNavAccess),
          icon: BriefcaseBusiness,
          key: SidebarTabKey.AskCore,
          title: t(
            askCoreWorkbenchNavAccess === 'learning'
              ? 'tab.askcoreLearningWorkbench'
              : 'tab.askcoreTeachingWorkbench',
          ),
          url: ASKCORE_WORKBENCH_PATH,
        },
      ] as NavItem[],
    [askCoreWorkbenchNavAccess, t, toggleCommandMenu],
  );

  const bottomMenuItems = useMemo(
    () =>
      [
        {
          icon: getRouteById('image')!.icon,
          key: SidebarTabKey.Image,
          title: t('tab.generation'),
          url: '/image',
        },
        {
          hidden: !showMarket,
          icon: getRouteById('community')!.icon,
          key: SidebarTabKey.Community,
          title: t('tab.community'),
          url: '/community',
        },
        {
          icon: getRouteById('resource')!.icon,
          key: SidebarTabKey.Resource,
          title: t('tab.resource'),
          url: '/resource',
        },
        {
          icon: getRouteById('memory')!.icon,
          key: SidebarTabKey.Memory,
          title: t('tab.memory'),
          url: '/memory',
        },
      ] as NavItem[],
    [t, showMarket],
  );

  const footer = useMemo(
    () => ({
      hideGitHub: !!hideGitHub,
      layout: 'compact' as const,
      showEvalEntry: false,
      showSettingsEntry: true,
    }),
    [hideGitHub],
  );

  const userPanel = useMemo(
    () => ({
      showDataImporter: false,
      showMemory: true,
    }),
    [],
  );

  return { bottomMenuItems, footer, topNavItems, userPanel };
};
