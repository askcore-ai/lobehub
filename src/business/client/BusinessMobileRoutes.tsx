import { type RouteObject } from 'react-router-dom';

export const BusinessMobileRoutesWithMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const module = await import('./AskCoreOrganization');
      return { Component: module.AskCoreOrganizationRoute };
    },
    path: 'organization',
  },
];
export const BusinessMobileRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessMobileRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const module = await import('./AskCoreOrganization/OrganizationJoinRoute');
      return { Component: module.AskCoreOrganizationJoinRoute };
    },
    path: '/join/organization/:token',
  },
  {
    lazy: async () => {
      const module = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: module.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
