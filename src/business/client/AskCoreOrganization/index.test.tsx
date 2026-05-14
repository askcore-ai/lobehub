import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
              units: [{ entry_year: 2025, id: 1, name: '2025级', org_id: 'org-1', sort_order: 0, unit_type: 'cohort' }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('组织设置').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '成员' }));
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '层级' }));
    await waitFor(() => expect(screen.getByText('教育组织')).toBeInTheDocument());
    expect(screen.getAllByText('成员').length).toBeGreaterThan(0);
    expect(screen.getByText('2025级')).toBeInTheDocument();
    expect(screen.getAllByText('Seed 的组织').length).toBeGreaterThan(0);
  });

  it('renders a tree-driven cohort hierarchy without raw ID inputs', async () => {
    const payload = {
      current: {
        id: 'org-1',
        isActive: true,
        name: 'Seed 的组织',
        role: 'owner',
        slug: 'seed',
      },
      members: [
        {
          email: 'owner@askcore.cn',
          id: 'mem-owner',
          name: 'Owner',
          role: 'owner',
          userId: 'user-owner',
        },
      ],
      organizations: [
        {
          id: 'org-1',
          isActive: true,
          name: 'Seed 的组织',
          role: 'owner',
          slug: 'seed',
        },
      ],
      permissions: {
        canInvite: true,
        canManageMembers: true,
        canUpdateMeta: true,
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
              units: [
                { id: 1, name: 'Seed School', org_id: 'org-1', sort_order: 0, unit_type: 'school' },
                { entry_year: 2025, id: 2, name: '2025级', org_id: 'org-1', parent_id: 1, sort_order: 0, unit_type: 'cohort' },
                { id: 3, name: '高一 1 班', org_id: 'org-1', parent_id: 2, sort_order: 0, unit_type: 'class' },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('组织设置').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '层级' }));
    await waitFor(() => expect(screen.getByText('2025级')).toBeInTheDocument());

    expect(screen.getByText('添加学校')).toBeInTheDocument();
    expect(screen.getByText('分配身份')).toBeInTheDocument();
    expect(screen.getByText('届别')).toBeInTheDocument();
    expect(screen.queryByText('创建层级')).not.toBeInTheDocument();
    expect(screen.queryByText('上级 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Better Auth 用户 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('教师 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('学生 ID')).not.toBeInTheDocument();
  });
});
