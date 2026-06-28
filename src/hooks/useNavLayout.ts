import { BriefcaseBusiness, Building2, HomeIcon, SearchIcon, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ASKCORE_ORGANIZATION_CHANGED_EVENT } from '@/business/client/AskCoreOrganization/events';
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

type AskCoreWorkbenchNavAccess =
  | 'identity_required'
  | 'learning'
  | 'loading'
  | 'organization_required'
  | 'teaching';

const resolveAskCoreWorkbenchNavAccess = async (): Promise<AskCoreWorkbenchNavAccess> => {
  try {
    const organizationState = await askCoreWorkbenchClient.getOrganizationState();
    if (!organizationState.organization?.organization_id) return 'organization_required';
  } catch {
    return 'organization_required';
  }

  try {
    const profile = await askCoreWorkbenchClient.getEducationProfile();
    switch (profile.workbench_mode) {
      case 'identity_required': {
        return 'identity_required';
      }
      case 'student_managed':
      case 'student_restricted': {
        return 'learning';
      }
      case 'teacher': {
        return 'teaching';
      }
      default: {
        return 'identity_required';
      }
    }
  } catch {
    return 'identity_required';
  }
};

const useAskCoreWorkbenchNavAccess = () => {
  const [access, setAccess] = useState<AskCoreWorkbenchNavAccess>('loading');

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const refresh = () => {
      const currentRequestId = requestId + 1;
      requestId = currentRequestId;
      setAccess('loading');
      void resolveAskCoreWorkbenchNavAccess().then((nextAccess) => {
        if (active && requestId === currentRequestId) setAccess(nextAccess);
      });
    };

    refresh();
    window.addEventListener(ASKCORE_ORGANIZATION_CHANGED_EVENT, refresh);

    return () => {
      active = false;
      window.removeEventListener(ASKCORE_ORGANIZATION_CHANGED_EVENT, refresh);
    };
  }, []);

  return access;
};

export const __resetAskCoreWorkbenchNavAccessForTest = () => {
  return undefined;
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
