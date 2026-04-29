'use client';

import { type ChatPluginPayload } from '@lobechat/types';
import { Button } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { BriefcaseBusiness, ExternalLink } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import {
  buildAskCoreWorkbenchUrl,
  getAskCoreWorkbenchRouteFromState,
  isAskCoreSuiteRunResult,
} from './utils';

const styles = createStaticStyles(({ css }) => ({
  cta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    padding-block: 12px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  description: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    min-width: 0;
  `,
  icon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 30px;
    height: 30px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
  `,
  main: css`
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  `,
  primary: css`
    border-color: ${cssVar.colorText};
    border-radius: 999px;
    color: ${cssVar.colorBgContainer};
    background: ${cssVar.colorText};

    &:hover,
    &:focus {
      border-color: ${cssVar.colorTextSecondary} !important;
      color: ${cssVar.colorBgContainer} !important;
      background: ${cssVar.colorTextSecondary} !important;
    }
  `,
  route: css`
    overflow: hidden;

    max-width: 420px;

    font-size: 12px;
    line-height: 1.35;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  title: css`
    font-size: 13px;
    font-weight: 500;
    line-height: 1.35;
    color: ${cssVar.colorText};
  `,
}));

interface AskCoreWorkbenchToolCtaProps {
  plugin?: ChatPluginPayload;
  pluginState?: any;
}

const AskCoreWorkbenchToolCta = memo<AskCoreWorkbenchToolCtaProps>(({ plugin, pluginState }) => {
  if (
    !isAskCoreSuiteRunResult({
      apiName: plugin?.apiName,
      identifier: plugin?.identifier,
      state: pluginState,
    })
  ) {
    return null;
  }

  const route = getAskCoreWorkbenchRouteFromState(pluginState);
  const href = buildAskCoreWorkbenchUrl({ route });

  return (
    <div className={styles.cta}>
      <div className={styles.main}>
        <span className={styles.icon}>
          <BriefcaseBusiness size={16} />
        </span>
        <div className={styles.description}>
          <span className={styles.title}>教学工作台已准备好</span>
          <span className={styles.route}>{route}</span>
        </div>
      </div>
      <Link to={href}>
        <Button className={styles.primary} icon={<ExternalLink size={14} />} size="small">
          打开教学工作台
        </Button>
      </Link>
    </div>
  );
});

AskCoreWorkbenchToolCta.displayName = 'AskCoreWorkbenchToolCta';

export default AskCoreWorkbenchToolCta;
