import {
  AtomIcon,
  BookOpenIcon,
  CalculatorIcon,
  GraduationCapIcon,
  LanguagesIcon,
  SchoolIcon,
} from 'lucide-react';

export type { OnboardingBranchPath } from './branch';
export {
  deriveOnboardingBranchPath,
  ONBOARDING_AGENT_PATH,
  ONBOARDING_CLASSIC_PATH,
} from './branch';

/**
 * Predefined AskCore education interest areas with icons and translation keys.
 * Use with `t('interests.area.${key}')` from the `onboarding` namespace.
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
