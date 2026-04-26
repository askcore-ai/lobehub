'use client';

import { memo } from 'react';

import { SubscriptionIframeWrapper } from './SubscriptionIframeWrapper';

const Credits = memo(() => {
  return <SubscriptionIframeWrapper page="credits" />;
});

Credits.displayName = 'Credits';
export default Credits;
