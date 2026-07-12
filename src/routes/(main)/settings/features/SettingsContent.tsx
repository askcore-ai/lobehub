'use client';

import { Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { SettingsTabs } from '@/store/global/initialState';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';

import { componentMap } from './componentMap';

const REDIRECT_MAP: Record<string, string> = {
  [SettingsTabs.Common]: SettingsTabs.Appearance,
  [SettingsTabs.ChatAppearance]: SettingsTabs.Appearance,
  [SettingsTabs.Agent]: SettingsTabs.ServiceModel,
  [SettingsTabs.TTS]: SettingsTabs.ServiceModel,
  [SettingsTabs.Image]: SettingsTabs.ServiceModel,
};

const BUSINESS_SETTINGS_TABS = [
  SettingsTabs.Plans,
  SettingsTabs.Credits,
  SettingsTabs.Billing,
  SettingsTabs.Referral,
  SettingsTabs.Usage,
  SettingsTabs.Notification,
];

interface SettingsContentProps {
  activeTab?: string;
  mobile?: boolean;
}

const SettingsContent = ({ mobile, activeTab }: SettingsContentProps) => {
  const enableAskCoreBilling = useServerConfigStore(serverConfigSelectors.enableAskCoreBilling);
  const navigate = useNavigate();

  useEffect(() => {
    if (activeTab && REDIRECT_MAP[activeTab]) {
      navigate(`/settings/${REDIRECT_MAP[activeTab]}`, { replace: true });
    }
    if (
      activeTab &&
      !enableAskCoreBilling &&
      BUSINESS_SETTINGS_TABS.includes(activeTab as SettingsTabs)
    ) {
      navigate(mobile ? '/me/settings' : '/settings/profile', { replace: true });
    }
  }, [activeTab, enableAskCoreBilling, mobile, navigate]);

  const renderComponent = (tab: string) => {
    const Component = componentMap[tab as keyof typeof componentMap] || componentMap.appearance;
    if (!Component) return null;

    const componentProps: { mobile?: boolean } = {};
    if (
      [
        SettingsTabs.About,
        SettingsTabs.ServiceModel,
        SettingsTabs.Provider,
        SettingsTabs.Profile,
        SettingsTabs.Stats,
        SettingsTabs.Usage,
        SettingsTabs.Security,
        ...(enableAskCoreBilling ? BUSINESS_SETTINGS_TABS : []),
      ].includes(tab as any)
    ) {
      componentProps.mobile = mobile;
    }

    return <Component {...componentProps} />;
  };

  if (activeTab && REDIRECT_MAP[activeTab]) return null;
  if (
    activeTab &&
    !enableAskCoreBilling &&
    BUSINESS_SETTINGS_TABS.includes(activeTab as SettingsTabs)
  ) {
    return null;
  }

  if (mobile) {
    return activeTab ? renderComponent(activeTab) : renderComponent(SettingsTabs.Profile);
  }

  return (
    <>
      {Object.keys(componentMap).map((tabKey) => {
        const isProvider = tabKey === SettingsTabs.Provider;
        if (activeTab !== tabKey) return null;
        const content = renderComponent(tabKey);
        if (isProvider) return <Fragment key={tabKey}>{content}</Fragment>;
        return (
          <Fragment key={tabKey}>
            <NavHeader />
            <SettingContainer maxWidth={1024} paddingBlock={'24px 128px'} paddingInline={24}>
              {content}
            </SettingContainer>
          </Fragment>
        );
      })}
    </>
  );
};

export default SettingsContent;
