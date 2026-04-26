'use client';

import { memo } from 'react';

import { SubscriptionIframeWrapper } from './SubscriptionIframeWrapper';

const Plans = memo(() => {
  return <SubscriptionIframeWrapper page="plans" />;
});

Plans.displayName = 'Plans';
export default Plans;
