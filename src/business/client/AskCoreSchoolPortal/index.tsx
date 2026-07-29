'use client';

import { memo } from 'react';

import { SourceHandoff } from './SourceHandoff';

export const AskCoreSchoolPortalRoute = memo(() => {
  return <SourceHandoff source="moodle" />;
});

AskCoreSchoolPortalRoute.displayName = 'AskCoreSchoolPortalRoute';
