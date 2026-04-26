import {
  AtomIcon,
  BookOpenIcon,
  CalculatorIcon,
  GraduationCapIcon,
  LanguagesIcon,
  SchoolIcon,
} from 'lucide-react';

/** Default target when the user opens `/onboarding`. Flip to `'agent'` when agent onboarding is ready to ship as the primary flow. */
export type DefaultOnboardingEntryVariant = 'agent' | 'classic';
export const DEFAULT_ONBOARDING_ENTRY_VARIANT: DefaultOnboardingEntryVariant = 'classic';

const resolveDefaultOnboardingPath = (variant: DefaultOnboardingEntryVariant) =>
  variant === 'agent' ? '/onboarding/agent' : '/onboarding/classic';

export const DEFAULT_ONBOARDING_PATH: '/onboarding/agent' | '/onboarding/classic' =
  resolveDefaultOnboardingPath(DEFAULT_ONBOARDING_ENTRY_VARIANT);

/**
 * Predefined interest areas with icons and translation keys.
 * Use with `t('interests.area.${key}')` from 'onboarding' namespace.
 */
export const INTEREST_AREAS = [
  { icon: SchoolIcon, key: 'primarySchool' },
  { icon: BookOpenIcon, key: 'middleSchool' },
  { icon: GraduationCapIcon, key: 'highSchool' },
  { icon: CalculatorIcon, key: 'math' },
  { icon: LanguagesIcon, key: 'english' },
  { icon: AtomIcon, key: 'physics' },
] as const;

export type InterestAreaKey = (typeof INTEREST_AREAS)[number]['key'];
