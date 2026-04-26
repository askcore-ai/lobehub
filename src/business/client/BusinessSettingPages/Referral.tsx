'use client';

import { memo } from 'react';

import { SubscriptionIframeWrapper } from './SubscriptionIframeWrapper';

const Referral = memo(() => {
  return <SubscriptionIframeWrapper page="referral" />;
});

Referral.displayName = 'Referral';
export default Referral;
