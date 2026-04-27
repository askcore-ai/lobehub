import { type RouteObject } from 'react-router-dom';

export const BusinessMobileRoutesWithMainLayout: RouteObject[] = [];
export const BusinessMobileRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessMobileRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const module = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: module.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
