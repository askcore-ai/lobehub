import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { type ReferralStatusString } from '@lobechat/types';
import { Plans } from '@lobechat/types';

type BusinessFeatureUser = {
  userEmail?: null | string;
  userId?: null | string;
};

export function isBusinessFeatureEnabledForUser(user: BusinessFeatureUser = {}) {
  if (!ENABLE_BUSINESS_FEATURES) return false;

  const userEmail = user.userEmail?.trim().toLowerCase();
  return Boolean(user.userId || userEmail);
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
