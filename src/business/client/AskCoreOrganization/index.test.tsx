import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreOrganizationRoute } from './index';

vi.mock('@/components/AntdStaticMethods', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const activeOrganizationPayload = {
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

const directoryPayload = {
  invitations: [
    {
      id: 501,
      invitation_kind: 'directed',
      org_id: 'org-1',
      person_id: 101,
      preset_roles: [],
      status: 'pending',
      token: 'invite-token',
    },
  ],
  org_id: 'org-1',
  people: [
    {
      display_name: '李老师',
      id: 101,
      lifecycle_status: 'active',
      org_id: 'org-1',
      primary_org_unit_id: 2,
      registration_status: 'invited',
    },
    {
      better_auth_user_id: 'user-student',
      display_name: '王同学',
      id: 102,
      lifecycle_status: 'active',
      org_id: 'org-1',
      primary_org_unit_id: 3,
      registration_status: 'registered',
    },
  ],
  role_assignments: [
    {
      id: 900,
      org_id: 'org-1',
      org_unit_id: 3,
      person_id: 101,
      role: 'teacher',
      subject_user_id: 'user:directory-person-101',
      teacher_id: 301,
    },
  ],
  roster_links: [
    { id: 701, org_id: 'org-1', person_id: 101, roster_id: 301, roster_kind: 'teacher' },
    { id: 702, org_id: 'org-1', person_id: 102, roster_id: 201, roster_kind: 'student' },
  ],
  units: [
    { id: 1, name: 'Seed School', org_id: 'org-1', sort_order: 0, unit_type: 'school' },
    {
      id: 2,
      name: '数学组',
      org_id: 'org-1',
      parent_id: 1,
      sort_order: 0,
      unit_type: 'department',
    },
    {
      id: 3,
      name: '高一 1 班',
      org_id: 'org-1',
      parent_id: 1,
      sort_order: 0,
      unit_type: 'class',
    },
  ],
};

describe('AskCoreOrganizationRoute', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('asks multi-organization sessions without an active organization to choose one', async () => {
    const payload = {
      current: null,
      members: [],
      organizations: [
        {
          id: 'org-1',
          isActive: false,
          name: 'First School',
          role: 'owner',
          slug: 'first',
        },
        {
          id: 'org-2',
          isActive: false,
          name: 'Second School',
          role: 'admin',
          slug: 'second',
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
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('请选择激活组织')).toBeInTheDocument());
    expect(screen.queryByText('还没有组织')).not.toBeInTheDocument();
    expect(screen.getByText('First School')).toBeInTheDocument();
    expect(screen.getByText('Second School')).toBeInTheDocument();
  });

  it('renders one unified organization directory instead of split member identity teacher student tabs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/workbench/organization/directory')) {
          return new Response(JSON.stringify(directoryPayload), { status: 200 });
        }
        if (url.endsWith('/workbench/organization/units')) {
          return new Response(
            JSON.stringify({ org_id: 'org-1', units: directoryPayload.units }),
            { status: 200 },
          );
        }
        if (url.includes('/workbench/organization/roles')) {
          return new Response(JSON.stringify({ items: directoryPayload.role_assignments }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/organization?tab=members']}>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '组织架构' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '身份绑定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '学生' })).not.toBeInTheDocument();

    const directory = screen.getByLabelText('组织架构工作区');
    expect(within(directory).getByText('Seed School')).toBeInTheDocument();
    expect(within(directory).getByText('数学组')).toBeInTheDocument();
    expect(within(directory).getByText('高一 1 班')).toBeInTheDocument();
    expect(within(directory).getAllByText('李老师').length).toBeGreaterThan(0);
    expect(within(directory).getAllByText('邀请中').length).toBeGreaterThan(0);
    expect(within(directory).getAllByText(/教师/).length).toBeGreaterThan(0);
    expect(within(directory).getByText('账号绑定')).toBeInTheDocument();
    expect(within(directory).getByText('定向邀请')).toBeInTheDocument();
    expect(within(directory).queryByPlaceholderText('不定向邀请位置')).not.toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /新建人员/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /不定向邀请/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /批量导入/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /导出/ })).toBeInTheDocument();

    const orgTree = within(directory).getByLabelText('组织树');
    expect(within(orgTree).getByRole('button', { name: /全部人员/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    fireEvent.click(within(orgTree).getByRole('button', { name: /高一 1 班/ }));
    await waitFor(() => expect(within(directory).getAllByText('王同学').length).toBeGreaterThan(0));
    expect(within(orgTree).getByRole('button', { name: /高一 1 班/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(directory).getAllByText('已注册').length).toBeGreaterThan(0);
    expect(within(directory).getByRole('button', { name: /添加到当前节点/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /当前节点邀请/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /批量导入到当前节点/ })).toBeInTheDocument();
  });
});
