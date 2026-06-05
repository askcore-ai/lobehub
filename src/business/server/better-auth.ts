import type { emailHarmony } from 'better-auth-harmony';
import { validateEmail } from 'better-auth-harmony/email';

import { isBusinessFeatureEnabledForUser } from './user';

export type BusinessEmailHarmonyOptions = NonNullable<Parameters<typeof emailHarmony>[0]>;

// eslint-disable-next-line unused-imports/no-unused-vars
export async function businessEmailValidator(email: string): Promise<boolean> {
  return true;
}

export const businessEmailHarmonyOptions = {
  allowNormalizedSignin: false,
  async validator(email: string) {
    return isBusinessFeatureEnabledForUser({ userEmail: email })
      ? businessEmailValidator(email)
      : validateEmail(email);
  },
} satisfies BusinessEmailHarmonyOptions;
