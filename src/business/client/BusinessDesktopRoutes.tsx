import { type RouteObject } from 'react-router-dom';

export const BusinessDesktopRoutesWithMainLayout: RouteObject[] = [];
export const BusinessDesktopRoutesWithSettingsLayout: RouteObject[] = [];
export const BusinessDesktopRoutesWithoutMainLayout: RouteObject[] = [
  {
    lazy: async () => {
      const module = await import('./BusinessSettingPages/AskCoreBillingPage');
      return { Component: module.AskCoreBillingEmbedRoute };
    },
    path: '/embed/subscription/:page',
  },
];
