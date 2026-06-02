import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { type ReferralStatusString } from '@lobechat/types';
import { Plans } from '@lobechat/types';

type BusinessFeatureUser = {
  userEmail?: null | string;
  userId?: null | string;
};

const parseAllowList = (value?: string) =>
  new Set(
    (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export function isBusinessFeatureEnabledForUser(user: BusinessFeatureUser = {}) {
  if (!ENABLE_BUSINESS_FEATURES) return false;

  const enabledUserIds = parseAllowList(process.env.ASKCORE_BILLING_ENABLED_USER_IDS);
  const enabledEmails = parseAllowList(process.env.ASKCORE_BILLING_ENABLED_EMAILS);
  const userEmail = user.userEmail?.trim().toLowerCase();
  const normalizedEmails = new Set([...enabledEmails].map((email) => email.toLowerCase()));

  if (enabledUserIds.has('*') || normalizedEmails.has('*')) return Boolean(user.userId || userEmail);
  if (user.userId && enabledUserIds.has(user.userId)) return true;
  if (userEmail && normalizedEmails.has(userEmail)) return true;

  return false;
}

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
  void userId;
  return Plans.Free;
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
