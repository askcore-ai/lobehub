'use client';

import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  cancelSchoolSourceHandoff,
  enterSchoolSource,
  SchoolHandoffError,
} from './handoffClient';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    display: grid;
    place-items: center;

    box-sizing: border-box;
    min-width: 0;
    min-height: min(520px, 70dvh);
    padding: clamp(20px, 5vw, 56px);
  `,
  panel: css`
    display: grid;
    gap: 16px;

    width: min(100%, 520px);
    padding: clamp(20px, 4vw, 36px);
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
    text-align: center;
  `,
  srOnly: css`
    position: absolute;
    overflow: hidden;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    border: 0;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  `,
  text: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    margin: 0;
    font-size: clamp(22px, 4vw, 32px);
    line-height: 1.2;
  `,
}));

export interface SourceHandoffProps {
  source: 'gibbon' | 'moodle';
}

const handoffTranslations = {
  gibbon: {
    continue: 'schoolPortal.handoff.gibbon.continue',
    message: 'schoolPortal.handoff.gibbon.message',
    title: 'schoolPortal.handoff.gibbon.title',
  },
  moodle: {
    continue: 'schoolPortal.handoff.moodle.continue',
    message: 'schoolPortal.handoff.moodle.message',
    title: 'schoolPortal.handoff.moodle.title',
  },
} as const;

export const SourceHandoff = memo<SourceHandoffProps>(({ source }) => {
  const { t } = useTranslation('common');
  const translations = handoffTranslations[source];
  const [failureStatus, setFailureStatus] = useState<number>();
  const mounted = useRef(true);

  const startHandoff = useCallback(async () => {
    setFailureStatus(undefined);
    try {
      await enterSchoolSource(source);
    } catch (error) {
      if (!mounted.current) return;
      setFailureStatus(error instanceof SchoolHandoffError ? error.status : 503);
    }
  }, [source]);

  useEffect(() => {
    mounted.current = true;
    void startHandoff();
    return () => {
      mounted.current = false;
      cancelSchoolSourceHandoff();
    };
  }, [startHandoff]);

  if (!failureStatus) {
    return (
      <span aria-live="polite" className={styles.srOnly} role="status">
        {t(translations.message)}
      </span>
    );
  }

  return (
    <main className={styles.page}>
      <section aria-labelledby="school-handoff-title" className={styles.panel}>
        <h1 className={styles.title} id="school-handoff-title">
          {t(
            failureStatus === 401
              ? 'schoolPortal.identity.denied'
              : 'schoolPortal.state.unavailable.title',
          )}
        </h1>
        <p aria-live="assertive" className={styles.text} role="alert">
          {t(
            failureStatus === 401
              ? 'schoolPortal.identity.denied'
              : 'schoolPortal.state.unavailable.message',
          )}
        </p>
        <Button
          icon={<RefreshCw aria-hidden focusable="false" />}
          type="primary"
          onClick={() => void startHandoff()}
        >
          {t('schoolPortal.connection.refresh')}
        </Button>
      </section>
    </main>
  );
});

SourceHandoff.displayName = 'SourceHandoff';
