'use client';

import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css }) => ({
  icon: css`
    @media (prefers-reduced-motion: no-preference) {
      animation: askcore-school-spin 1.4s linear infinite;
    }

    @keyframes askcore-school-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
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
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const translations = handoffTranslations[source];

  useEffect(() => {
    if (submitted.current || !formRef.current) return;
    submitted.current = true;
    formRef.current.requestSubmit();
  }, []);

  return (
    <main className={styles.page}>
      <section aria-labelledby="school-handoff-title" className={styles.panel}>
        <LoaderCircle aria-hidden className={styles.icon} size={36} />
        <h1 className={styles.title} id="school-handoff-title">
          {t(translations.title)}
        </h1>
        <p aria-live="polite" className={styles.text} role="status">
          {t(translations.message)}
        </p>
        <form action="/api/askcore/school/handoff" method="post" ref={formRef}>
          <input name="source" type="hidden" value={source} />
          <Button
            htmlType="submit"
            icon={<ArrowUpRight aria-hidden focusable="false" />}
            type="primary"
          >
            {t(translations.continue)}
          </Button>
        </form>
      </section>
    </main>
  );
});

SourceHandoff.displayName = 'SourceHandoff';
