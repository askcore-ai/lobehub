'use client';

import { Icon } from '@lobehub/ui';
import { type TabBarProps } from '@lobehub/ui/mobile';
import { TabBar } from '@lobehub/ui/mobile';
import { createStaticStyles } from 'antd-style';
import { MessageSquare, School, User } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { enterSchoolSource } from '@/business/client/AskCoreSchoolPortal/handoffClient';
import sourceMobileNavVisualContract from '@/features/AskCoreMobileNavigation/sourceMobileNavVisualContract.generated.json';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { SidebarTabKey } from '@/store/global/initialState';

const icons = { MessageSquare, School, User } as const;
const { activeFillPercent, layout, theme } = sourceMobileNavVisualContract;

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    svg {
      fill: color-mix(
        in srgb,
        ${cssVar[theme.tokens.active as keyof typeof cssVar]} ${activeFillPercent}%,
        transparent
      );
    }
  `,
  container: css`
    position: fixed;
    z-index: 100;
    inset-block-end: 0;
    inset-inline: 0;
  `,
}));

const NavBar = memo(() => {
  const { t } = useTranslation(['common', 'setting']);
  const activeKey = useActiveTabKey();
  const navigate = useNavigate();

  const items: TabBarProps['items'] = useMemo(
    () =>
      sourceMobileNavVisualContract.items.map((item) => {
        const title =
          item.key === 'chat'
            ? t('tab.chat')
            : item.key === 'school'
              ? t('setting:group.school')
              : t('tab.me');
        const key =
          item.key === 'chat'
            ? SidebarTabKey.Chat
            : item.key === 'me'
              ? SidebarTabKey.Me
              : item.key;
        return {
          icon: (active: boolean) => (
            <Icon
              className={active ? styles.active : undefined}
              icon={icons[item.icon as keyof typeof icons]}
            />
          ),
          key,
          onClick: () => {
            if (item.key === 'school') {
              void enterSchoolSource('moodle').catch(() => navigate(item.href));
              return;
            }
            navigate(item.href);
          },
          title,
        };
      }) as TabBarProps['items'],
    [navigate, t],
  );

  return (
    <TabBar
      activeKey={activeKey}
      className={styles.container}
      height={layout.barHeight}
      items={items}
    />
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
