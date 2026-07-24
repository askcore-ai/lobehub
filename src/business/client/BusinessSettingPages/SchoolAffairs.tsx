'use client';

import { memo } from 'react';

import { SourceHandoff } from '@/business/client/AskCoreSchoolPortal/SourceHandoff';

const SchoolAffairs = memo(() => {
  return <SourceHandoff source="gibbon" />;
});

SchoolAffairs.displayName = 'SchoolAffairs';

export default SchoolAffairs;
