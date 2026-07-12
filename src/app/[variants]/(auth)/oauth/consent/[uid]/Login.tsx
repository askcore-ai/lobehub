'use client';

import { Avatar, Block, Button, Flexbox, Skeleton, Text } from '@lobehub/ui';
import { Result } from 'antd';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import BrandLoading from '@/components/Loading/BrandTextLoading';
import AuthCard from '@/features/AuthCard';
import { useSession } from '@/libs/better-auth/auth-client';

import OAuthApplicationLogo from './components/OAuthApplicationLogo';

interface LoginConfirmProps {
  autoSubmit?: boolean;
  clientMetadata: {
    clientName?: string;
    isFirstParty?: boolean;
    logo?: string;
  };
  uid: string;
}

const LoginConfirmClient = memo<LoginConfirmProps>(
  ({ autoSubmit = false, uid, clientMetadata }) => {
    const { t } = useTranslation('oauth'); // Assuming translations are in 'oauth'

    const clientDisplayName = clientMetadata?.clientName || 'the application';

    const { data: session, isPending } = useSession();
    const isUserStateInit = !isPending && !!session;
    const avatar = session?.user?.image || '';
    const nickName = session?.user?.name || '';

    const [isLoading, setIsLoading] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);

    React.useEffect(() => {
      if (!autoSubmit || !isUserStateInit) return;
      setIsLoading(true);
      formRef.current?.requestSubmit();
    }, [autoSubmit, isUserStateInit]);

    const titleText = t('login.title', { clientName: clientDisplayName });
    const descriptionText = t('login.description', { clientName: clientDisplayName });
    const buttonText = t('login.button'); // Or "Continue"

    const form = (
      <form
        action="/oidc/consent"
        method="post"
        ref={formRef}
        style={autoSubmit ? { display: 'none' } : { width: '100%' }}
        onSubmit={() => setIsLoading(true)}
      >
        <input name="uid" type="hidden" value={uid} />
        <input name="choice" type="hidden" value={'accept'} />
        <Button
          block
          disabled={!isUserStateInit}
          htmlType="submit"
          loading={isLoading}
          name="consent"
          size="large"
          type="primary"
          value="accept"
        >
          {buttonText}
        </Button>
      </form>
    );

    if (autoSubmit && isUserStateInit) {
      return (
        <>
          <Result icon={<BrandLoading debugId="school-oidc-login" />} status="success" />
          {form}
        </>
      );
    }

    return (
      <Flexbox gap={16} width={'min(100%,400px)'}>
        <OAuthApplicationLogo
          clientDisplayName={clientDisplayName}
          isFirstParty={clientMetadata.isFirstParty}
          logoUrl={clientMetadata.logo}
        />
        <AuthCard footer={form} subtitle={descriptionText} title={titleText}>
          <Block padding={16} variant={'outlined'}>
            {isUserStateInit ? (
              <Flexbox horizontal align={'center'} gap={16}>
                <Avatar alt={nickName || ''} avatar={avatar} shape={'square'} size={40} />
                <Text fontSize={18} weight={500}>
                  {nickName}
                </Text>
              </Flexbox>
            ) : (
              <Flexbox horizontal gap={16}>
                <Skeleton.Avatar active shape={'square'} size={40} />
                <Skeleton.Button active />
              </Flexbox>
            )}
          </Block>
        </AuthCard>
      </Flexbox>
    );
  },
);

LoginConfirmClient.displayName = 'LoginConfirmClient';

export default LoginConfirmClient;
