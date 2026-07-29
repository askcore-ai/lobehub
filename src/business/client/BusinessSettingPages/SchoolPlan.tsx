'use client';

import { Alert, Skeleton, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  fetchSchoolPortalManifestForGeneration,
  schoolPortalManifestCacheKey,
  stableSchoolSessionGeneration,
} from '@/business/client/AskCoreSchoolPortal/api';
import { SchoolBillingPage } from '@/business/client/AskCoreSchoolPortal/BillingPage';
import { useSession } from '@/libs/better-auth/auth-client';

const styles = createStaticStyles(({ css }) => ({
  header: css`
    display: grid;
    gap: 4px;
    margin-block-end: 20px;
  `,
  page: css`
    display: grid;
    min-width: 0;
  `,
}));

const SchoolPlan = memo(() => {
  const { t } = useTranslation('common');
  const {
    data: accountSession,
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  } = useSession();
  const sessionGeneration = stableSchoolSessionGeneration(accountSession, {
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  });
  const accountUserId =
    sessionGeneration && typeof accountSession?.user?.id === 'string'
      ? accountSession.user.id.trim()
      : '';
  const { data, error, isLoading, mutate } = useSWR(
    schoolPortalManifestCacheKey(sessionGeneration, 'school-plan'),
    ([, generation]) => fetchSchoolPortalManifestForGeneration(generation),
    { revalidateOnFocus: true, shouldRetryOnError: false },
  );
  const school = data?.state === 'ready' ? data.schools[0] : undefined;

  if (accountSessionPending || accountSessionRefetching || isLoading) {
    return <Skeleton active aria-label={t('schoolPortal.schoolPlan.loading')} />;
  }

  if (!accountUserId) {
    return <Alert showIcon title={t('schoolPortal.identity.denied')} type="warning" />;
  }

  if (error || !school) {
    const state = !error && data?.state === 'conflict' ? 'conflict' : 'unavailable';
    return (
      <Alert
        showIcon
        description={t(`schoolPortal.state.${state}.message`)}
        title={t(`schoolPortal.state.${state}.title`)}
        type="warning"
        action={
          <Button icon={RefreshCw} onClick={() => void mutate()}>
            {t('schoolPortal.connection.refresh')}
          </Button>
        }
      />
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Text as={'h1'} fontSize={28} weight={'bold'}>
          {t('schoolPortal.surface.schoolPlan')}
        </Text>
        <Text as={'p'} type={'secondary'}>
          {school.name}
        </Text>
      </header>
      <SchoolBillingPage accountUserId={accountUserId} schoolKey={school.key} />
    </section>
  );
});

SchoolPlan.displayName = 'SchoolPlan';

export default SchoolPlan;
