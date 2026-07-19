import { type RouteObject } from 'react-router-dom';

const loadSchoolRoute = async () => {
  const routeModule = await import('./AskCoreSchoolPortal');
  return { Component: routeModule.AskCoreSchoolPortalRoute };
};

export const BusinessMobileRoutesWithMainLayout: RouteObject[] = [
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
    lazy: loadSchoolRoute,
    path: 'school/operations-center',
  },
  {
    lazy: loadSchoolRoute,
    path: 'school/billing',
  },
  {
    lazy: async () => {
      const routeModule = await import('./AskCoreWorkbench/ProtocolRoute');
      return { Component: routeModule.AskCoreProtocolRoute };
    },
    path: 'askcore/workbench',
  },
];
export const BusinessMobileRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessMobileRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const routeModule = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: routeModule.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
