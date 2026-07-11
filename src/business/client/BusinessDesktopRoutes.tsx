import { type RouteObject } from 'react-router-dom';

export const BusinessDesktopRoutesWithMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const route = await import('./AskCoreWorkbench');
      return { Component: route.AskCoreWorkbenchRoute };
    },
    path: 'askcore/workbench',
  },
];
export const BusinessDesktopRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessDesktopRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const route = await import('./AskCoreOrganization/OrganizationJoinRoute');
      return { Component: route.AskCoreOrganizationJoinRoute };
    },
    path: '/join/organization/:token',
  },
  {
    lazy: async () => {
      const route = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: route.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
