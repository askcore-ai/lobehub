import {
  BookOpenCheckIcon,
  GraduationCapIcon,
  HomeIcon,
  SchoolIcon,
  SearchIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  fetchSchoolPortalManifest,
  fetchSchoolSourceSession,
  SCHOOL_PORTAL_API,
} from '@/business/client/AskCoreSchoolPortal/api';
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

export const useNavLayout = (): NavLayout => {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const { showMarket, hideGitHub } = useServerConfigStore(featureFlagsSelectors);
  const { data: schoolPortal } = useSWR(SCHOOL_PORTAL_API, fetchSchoolPortalManifest, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const sharedSchool = schoolPortal?.state === 'ready' ? schoolPortal.schools[0] : undefined;
  const { data: schoolSession } = useSWR(
    sharedSchool?.role_source_url ?? null,
    fetchSchoolSourceSession,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );
  const teachingLaunchUrl = sharedSchool?.destinations.find(
    (destination) => destination.key === 'teaching',
  )?.launch_url;
  const isEducator = schoolSession?.role === 'teacher' || schoolSession?.role === 'administrator';
  const isLearner = schoolSession?.role === 'student';

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
          icon: SchoolIcon,
          key: 'school',
          title: '学校',
          url: '/school',
        },
        {
          hidden: !isEducator || !teachingLaunchUrl,
          icon: BookOpenCheckIcon,
          key: 'teaching-center',
          title: '教学中心',
          url: teachingLaunchUrl,
        },
        {
          hidden: !isLearner || !teachingLaunchUrl,
          icon: GraduationCapIcon,
          key: 'learning-space',
          title: '学习空间',
          url: teachingLaunchUrl,
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
      ] as NavItem[],
    [isEducator, isLearner, t, teachingLaunchUrl, toggleCommandMenu],
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
    [showMarket, t],
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
