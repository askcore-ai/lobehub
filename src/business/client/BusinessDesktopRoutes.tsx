import { type RouteObject } from 'react-router-dom';

const loadSchoolRoute = async () => {
  const route = await import('./AskCoreSchoolPortal');
  return { Component: route.AskCoreSchoolPortalRoute };
};

export const BusinessDesktopRoutesWithMainLayout: RouteObject[] = [
  {
    lazy: loadSchoolRoute,
    path: 'school',
  },
  {
    lazy: loadSchoolRoute,
    path: 'school/teaching-center',
  },
  {
    lazy: loadSchoolRoute,
    path: 'school/learning-space',
  },
  {
    lazy: async () => {
      const route = await import('./AskCoreWorkbench/ProtocolRoute');
      return { Component: route.AskCoreProtocolRoute };
    },
    path: 'askcore/workbench',
  },
];
export const BusinessDesktopRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessDesktopRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const route = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: route.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
