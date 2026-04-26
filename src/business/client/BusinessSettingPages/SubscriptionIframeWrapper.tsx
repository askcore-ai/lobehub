'use client';

import { memo } from 'react';

import AskCoreBillingPage, { type AskCoreBillingPageKey } from './AskCoreBillingPage';

interface SubscriptionIframeWrapperProps {
  page: AskCoreBillingPageKey;
}

export const SubscriptionIframeWrapper = memo<SubscriptionIframeWrapperProps>(({ page }) => (
  <AskCoreBillingPage page={page} />
));

SubscriptionIframeWrapper.displayName = 'SubscriptionIframeWrapper';
