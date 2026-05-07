import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreOrganizationRoute } from './index';

vi.mock('@/components/AntdStaticMethods', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('AskCoreOrganizationRoute', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not render the invite card for regular members', async () => {
    const payload = {
      current: {
        id: 'org-1',
        isActive: true,
        name: 'Seed 的组织',
        role: 'member',
        slug: 'seed',
      },
      members: [
        {
          email: 'teacher@askcore.cn',
          id: 'mem-1',
          name: 'Seed',
          role: 'member',
          userId: 'user-1',
        },
      ],
      organizations: [
        {
          id: 'org-1',
          isActive: true,
          name: 'Seed 的组织',
          role: 'member',
          slug: 'seed',
        },
      ],
      permissions: {
        canInvite: false,
        canManageMembers: false,
        canUpdateMeta: false,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/workbench/organization/units')) {
          return new Response(
            JSON.stringify({
              org_id: 'org-1',
              units: [{ id: 1, name: '高一', org_id: 'org-1', sort_order: 0, tenant_id: 1, unit_type: 'grade' }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    render(<AskCoreOrganizationRoute />);

    await waitFor(() => expect(screen.getAllByText('组织设置').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText('教育组织')).toBeInTheDocument());
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument();
    expect(screen.getAllByText('成员').length).toBeGreaterThan(0);
    expect(screen.getByText('高一')).toBeInTheDocument();
    expect(screen.getAllByText('Seed 的组织').length).toBeGreaterThan(0);
  });
});
