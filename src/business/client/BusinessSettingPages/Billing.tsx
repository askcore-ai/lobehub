'use client';

import { memo } from 'react';

import { SubscriptionIframeWrapper } from './SubscriptionIframeWrapper';

const Billing = memo(() => {
  return <SubscriptionIframeWrapper page="billing" />;
});

Billing.displayName = 'Billing';
export default Billing;
