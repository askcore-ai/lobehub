'use client';

import { memo } from 'react';

import { styles } from '../styles';

interface QuickAction {
  desc: string;
  icon: React.ReactNode;
  onClick?: () => void;
  title: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export const QuickActions = memo<QuickActionsProps>(({ actions }) => {
  return (
    <div className={styles.quickActionsGrid}>
      {actions.map((action, idx) => (
        <div className={styles.quickActionCard} key={idx} role="button" tabIndex={0} onClick={action.onClick}>
          <div className={styles.quickActionIcon}>{action.icon}</div>
          <div className={styles.quickActionTitle}>{action.title}</div>
          <div className={styles.quickActionDesc}>{action.desc}</div>
        </div>
      ))}
    </div>
  );
});

QuickActions.displayName = 'QuickActions';
