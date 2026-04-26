'use client';

import { memo } from 'react';

import { SubscriptionIframeWrapper } from './SubscriptionIframeWrapper';

const Usage = memo(() => {
  return <SubscriptionIframeWrapper page="usage" />;
});

Usage.displayName = 'Usage';
export default Usage;
