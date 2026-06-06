'use client';

import { COPYRIGHT_FULL } from '@lobechat/business-const';
import { Center, Flexbox, Text } from '@lobehub/ui';
import { Divider } from 'antd';
import { cx } from 'antd-style';
import Link from 'next/link';
import { type FC, type PropsWithChildren } from 'react';

import { ProductLogo } from '@/components/Branding';
import ComplianceLinks from '@/components/ComplianceLinks';
import { useIsDark } from '@/hooks/useIsDark';

import AuthLangButton from './AuthLangButton';
import { useAuthServerConfigStore } from './AuthServerConfigProvider';
import AuthThemeButton from './AuthThemeButton';
import { styles } from './style';

const AuthContainer: FC<PropsWithChildren> = ({ children }) => {
  const isDarkMode = useIsDark();
  const compliance = useAuthServerConfigStore((s) => s.serverConfig.compliance);
  return (
    <Flexbox className={styles.outerContainer} height={'100%'} padding={8} width={'100%'}>
      <Flexbox
        className={cx(isDarkMode ? styles.innerContainerDark : styles.innerContainerLight)}
        height={'100%'}
        width={'100%'}
      >
        <Flexbox
          horizontal
          align={'center'}
          gap={8}
          justify={'space-between'}
          padding={16}
          width={'100%'}
        >
          <Link aria-label={'LobeHub'} href={'/'} style={{ display: 'inline-flex' }}>
            <ProductLogo size={40} />
          </Link>
          <Flexbox horizontal align={'center'}>
            <AuthLangButton size={18} />
            <Divider className={styles.divider} orientation={'vertical'} />
            <AuthThemeButton size={18} />
          </Flexbox>
        </Flexbox>
        <Center height={'100%'} padding={16} width={'100%'}>
          {children}
        </Center>
        <Center padding={24} width={'100%'}>
          <Flexbox align={'center'} gap={6} width={'100%'}>
            <Text align={'center'} type={'secondary'}>
              {COPYRIGHT_FULL}
            </Text>
            <ComplianceLinks compliance={compliance} />
          </Flexbox>
        </Center>
      </Flexbox>
    </Flexbox>
  );
};

export default AuthContainer;
