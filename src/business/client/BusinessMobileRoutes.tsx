import { type RouteObject } from 'react-router-dom';

export const BusinessMobileRoutesWithMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const routeModule = await import('./AskCoreSchoolPortal');
      return { Component: routeModule.AskCoreSchoolPortalRoute };
    },
    path: 'school',
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
