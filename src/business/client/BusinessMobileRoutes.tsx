import { type RouteObject } from 'react-router-dom';

export const BusinessMobileRoutesWithMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const routeModule = await import('./AskCoreOrganization');
      return { Component: routeModule.AskCoreOrganizationRoute };
    },
    path: 'organization',
  },
];
export const BusinessMobileRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessMobileRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const routeModule = await import('./AskCoreOrganization/OrganizationJoinRoute');
      return { Component: routeModule.AskCoreOrganizationJoinRoute };
    },
    path: '/join/organization/:token',
  },
  {
    lazy: async () => {
      const routeModule = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: routeModule.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
