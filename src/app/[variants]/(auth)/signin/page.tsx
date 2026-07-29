'use client';

import { Suspense } from 'react';

import Loading from '@/components/Loading/BrandTextLoading';

import { SignInEmailStep } from './SignInEmailStep';
import { SignInPasswordStep } from './SignInPasswordStep';
import { useSignIn } from './useSignIn';
import { WechatMobileLoginStatus } from './WechatMobileLoginStatus';

const SignInPage = () => {
  const {
    disableEmailPassword,
    cancelWechatMobile,
    confirmWechatAccountSwitch,
    email,
    form,
    handleBackToEmail,
    handleCheckUser,
    handleForgotPassword,
    handleSignIn,
    handleSocialSignIn,
    isSocialOnly,
    lastAuthProvider,
    loading,
    oAuthSSOProviders,
    openPreparedWechat,
    retryWechatMobileLogin,
    serverConfigInit,
    socialLoading,
    step,
    wechatMobileLogin,
  } = useSignIn();

  return (
    <>
      <Suspense fallback={<Loading debugId={'Signin'} />}>
        {step === 'email' ? (
          <SignInEmailStep
            disableEmailPassword={disableEmailPassword}
            form={form as any}
            isSocialOnly={isSocialOnly}
            lastAuthProvider={lastAuthProvider}
            loading={loading}
            oAuthSSOProviders={oAuthSSOProviders}
            serverConfigInit={serverConfigInit}
            socialLoading={socialLoading}
            onCheckUser={handleCheckUser}
            onSetPassword={handleForgotPassword}
            onSocialSignIn={handleSocialSignIn}
          />
        ) : (
          <SignInPasswordStep
            email={email}
            form={form as any}
            loading={loading}
            onBackToEmail={handleBackToEmail}
            onForgotPassword={handleForgotPassword}
            onSubmit={handleSignIn}
          />
        )}
      </Suspense>
      <WechatMobileLoginStatus
        state={wechatMobileLogin}
        onCancel={cancelWechatMobile}
        onConfirmAccountSwitch={confirmWechatAccountSwitch}
        onOpenWechat={openPreparedWechat}
        onRetry={retryWechatMobileLogin}
      />
    </>
  );
};

export default SignInPage;
