import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { type ReferralStatusString } from '@lobechat/types';
import { Plans } from '@lobechat/types';

import {
  askCoreAssertionHeaderName,
  buildAskCoreAssertion,
} from '@/server/services/askcoreAssertion';

type BusinessFeatureUser = {
  userEmail?: null | string;
  userId?: null | string;
};

export function isBusinessFeatureEnabledForUser(user: BusinessFeatureUser = {}) {
  void user;
  return false;
}

export function isAskCoreBillingEnabledForUser(user: BusinessFeatureUser = {}) {
  if (!ENABLE_BUSINESS_FEATURES) return false;
  const userEmail = user.userEmail?.trim().toLowerCase();
  return Boolean(user.userId || userEmail);
}

const askCoreApiBaseUrl = () =>
  (
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    'http://api:8000'
  ).replace(/\/+$/, '');

const askCorePlanHint = (planId: unknown): Plans => {
  if (planId === 'professional') return Plans.Ultimate;
  if (planId === 'personal') return Plans.Premium;
  return Plans.Free;
};

const askCorePlanHintTimeoutMs = () => {
  const configured = Number(process.env.ASKCORE_PLAN_HINT_TIMEOUT_MS || 3000);
  return Number.isFinite(configured) && configured > 0 ? configured : 3000;
};

export interface OnUserActivityForBusinessParams {
  currentTime: Date;
  previousLastActiveAt: Date;
  userCreatedAt: Date;
  userId: string;
}

export async function getReferralStatus(userId: string): Promise<ReferralStatusString | undefined> {
  void userId;
  return undefined;
}

export async function getSubscriptionPlan(userId: string): Promise<Plans> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), askCorePlanHintTimeoutMs());
  try {
    const assertion = await buildAskCoreAssertion({
      roles: ['workbench_user'],
      scopes: ['billing.read'],
      sub: userId,
    });
    const response = await fetch(`${askCoreApiBaseUrl()}/api/billing/v1/account`, {
      cache: 'no-store',
      headers: { [askCoreAssertionHeaderName()]: assertion },
      signal: controller.signal,
    });
    if (!response.ok) return Plans.Free;
    const payload = (await response.json()) as { personal?: { plan_id?: unknown } };
    return askCorePlanHint(payload.personal?.plan_id);
  } catch {
    return Plans.Free;
  } finally {
    clearTimeout(timeout);
  }
}

export async function initNewUserForBusiness(
  userId: string,
  createdAt: Date | null | undefined,
): Promise<void> {
  void userId;
  void createdAt;
}

export async function onUserActivityForBusiness(
  params: OnUserActivityForBusinessParams,
): Promise<void> {
  void params;
}
