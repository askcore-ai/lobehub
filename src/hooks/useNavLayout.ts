import {
  BookOpenCheckIcon,
  GraduationCapIcon,
  HomeIcon,
  SchoolIcon,
  SearchIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import {
  fetchSchoolPortalManifestForGeneration,
  fetchSchoolSourceSessionForGeneration,
  readSchoolPortalBootstrapSnapshot,
  schoolPortalAuthorizationDenied,
  schoolPortalManifestCacheKey,
  schoolPortalManifestScope,
  stableSchoolSessionGeneration,
  schoolSourceSessionCacheKey,
} from '@/business/client/AskCoreSchoolPortal/api';
import type {
  SchoolPortalManifest,
  SchoolSourceSession,
} from '@/business/client/AskCoreSchoolPortal/types';
import { getRouteById } from '@/config/routes';
import { useSession } from '@/libs/better-auth/auth-client';
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
  const { pathname } = useLocation();
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const { showMarket, hideGitHub } = useServerConfigStore(featureFlagsSelectors);
  const {
    data: accountSession,
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  } = useSession();
  const sessionGeneration = stableSchoolSessionGeneration(accountSession, {
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  });
  const portalScope = schoolPortalManifestScope(pathname);
  const bootstrapSnapshot = sessionGeneration
    ? readSchoolPortalBootstrapSnapshot(sessionGeneration)
    : undefined;

  const {
    data: liveSchoolPortal,
    error: schoolPortalError,
    isValidating: schoolPortalValidating,
  } = useSWR(
    schoolPortalManifestCacheKey(sessionGeneration, portalScope),
    ([, generation]) => fetchSchoolPortalManifestForGeneration(generation),
    {
      fallbackData: bootstrapSnapshot?.portal,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: liveSchoolSession,
    error: schoolSessionError,
    isValidating: schoolSessionValidating,
  } = useSWR(
    schoolSourceSessionCacheKey(sessionGeneration),
    ([url, generation]) => fetchSchoolSourceSessionForGeneration(url, generation),
    {
      fallbackData: bootstrapSnapshot?.sourceSession,
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );
  const exactBootstrapPair =
    bootstrapSnapshot?.portal === liveSchoolPortal &&
    bootstrapSnapshot?.sourceSession === liveSchoolSession;
  const livePairConfirmed =
    !schoolPortalError &&
    !schoolSessionError &&
    !schoolPortalValidating &&
    !schoolSessionValidating &&
    liveSchoolPortal?.state === 'ready' &&
    liveSchoolSession?.authenticated === true;
  const bootstrapPairTrusted =
    !schoolPortalError &&
    !schoolSessionError &&
    exactBootstrapPair &&
    liveSchoolPortal?.state === 'ready' &&
    liveSchoolSession?.authenticated === true;
  const authorizationDenied =
    schoolPortalAuthorizationDenied(schoolPortalError) ||
    schoolPortalAuthorizationDenied(schoolSessionError);
  const sourceSessionUnauthenticated =
    !schoolSessionError &&
    !schoolSessionValidating &&
    !!liveSchoolSession &&
    liveSchoolSession.authenticated !== true;
  const authorizationLost = authorizationDenied || sourceSessionUnauthenticated;
  const [confirmedPair, setConfirmedPair] = useState<{
    generation: string;
    portal: SchoolPortalManifest;
    sourceSession: SchoolSourceSession;
  }>();

  useEffect(() => {
    if (!sessionGeneration || authorizationLost) {
      setConfirmedPair(undefined);
      return;
    }
    if (liveSchoolPortal && liveSchoolSession && livePairConfirmed) {
      setConfirmedPair({
        generation: sessionGeneration,
        portal: liveSchoolPortal,
        sourceSession: liveSchoolSession,
      });
      return;
    }
    if (
      !schoolPortalError &&
      !schoolPortalValidating &&
      liveSchoolPortal &&
      liveSchoolPortal.state !== 'ready'
    ) {
      setConfirmedPair(undefined);
    }
  }, [
    authorizationLost,
    livePairConfirmed,
    liveSchoolPortal,
    liveSchoolSession,
    schoolPortalError,
    schoolPortalValidating,
    sessionGeneration,
  ]);

  const activePair = livePairConfirmed
    ? { portal: liveSchoolPortal, sourceSession: liveSchoolSession }
    : bootstrapPairTrusted
      ? { portal: liveSchoolPortal, sourceSession: liveSchoolSession }
      : confirmedPair?.generation === sessionGeneration && !authorizationLost
        ? confirmedPair
        : undefined;
  const schoolPortal = activePair?.portal;
  const schoolSession = activePair?.sourceSession;
  const sharedSchool = schoolPortal?.state === 'ready' ? schoolPortal.schools[0] : undefined;
  const hasTeachingDestination = sharedSchool?.destinations.some(
    (destination) => destination.key === 'teaching',
  );
  const sourceRole = schoolSession?.authenticated ? schoolSession.role : undefined;
  const isEducator = sourceRole === 'teacher' || sourceRole === 'administrator';
  const isLearner = sourceRole === 'student';

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
          hidden: !isEducator || !hasTeachingDestination,
          icon: BookOpenCheckIcon,
          key: 'teaching-center',
          title: '教学中心',
          url: '/school/teaching-center',
        },
        {
          hidden: !isLearner || !hasTeachingDestination,
          icon: GraduationCapIcon,
          key: 'learning-space',
          title: '学习空间',
          url: '/school/learning-space',
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
    [hasTeachingDestination, isEducator, isLearner, t, toggleCommandMenu],
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
