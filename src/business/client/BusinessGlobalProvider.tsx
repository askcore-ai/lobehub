'use client';

import { type ReactNode, useEffect } from 'react';

const bootstrapOrganization = async () => {
  await fetch('/api/askcore/organizations/bootstrap', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    method: 'POST',
  });
};

export default function BusinessGlobalProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.location.pathname.startsWith('/join/organization/')) return;
    bootstrapOrganization().catch(() => {
      // Anonymous visitors and stale sessions are handled by the target pages.
    });
  }, []);

  return children;
}
