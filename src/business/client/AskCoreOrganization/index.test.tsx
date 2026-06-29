import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const memberOrganizationPayload = {
  ...activeOrganizationPayload,
  current: {
    ...activeOrganizationPayload.current,
    role: 'member',
  },
  members: [
    {
      email: 'member@askcore.cn',
      id: 'mem-member',
      name: 'Member',
      role: 'member',
      userId: 'user-member',
    },
  ],
  organizations: [
    {
      ...activeOrganizationPayload.organizations[0],
      role: 'member',
    },
  ],
  permissions: {
    canInvite: false,
    canManageMembers: false,
    canUpdateMeta: false,
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
  member_summaries: {
    'user-owner': {
      email: 'owner@askcore.cn',
      member_id: 'mem-owner',
      name: '张扬',
      organization_role: 'owner',
    },
    'user-student': {
      email: 'student@askcore.cn',
      member_id: 'mem-student',
      name: '王同学',
      organization_role: 'member',
    },
  },
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
    {
      better_auth_user_id: 'user-owner',
      display_name: '张扬',
      id: 103,
      lifecycle_status: 'active',
      org_id: 'org-1',
      primary_org_unit_id: null,
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
          return new Response(JSON.stringify({ org_id: 'org-1', units: directoryPayload.units }), {
            status: 200,
          });
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

    await waitFor(() => expect(screen.getByLabelText('组织架构工作区')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '概览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '组织架构' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Seed 的组织').length).toBeGreaterThan(0);
    expect(screen.getByText('组织 ID')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '身份绑定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '学生' })).not.toBeInTheDocument();
    expect(screen.getByText('1 注册成员')).toBeInTheDocument();
    expect(screen.getByText('注册成员')).toBeInTheDocument();

    const directory = screen.getByLabelText('组织架构工作区');
    await waitFor(() => expect(within(directory).getByText('Seed School')).toBeInTheDocument());
    expect(within(directory).getByText('数学组')).toBeInTheDocument();
    expect(within(directory).getByText('高一 1 班')).toBeInTheDocument();
    expect(within(directory).getAllByText('张扬').length).toBeGreaterThan(0);
    expect(within(directory).getByText('归属')).toBeInTheDocument();
    expect(within(directory).queryByText('主位置')).not.toBeInTheDocument();
    expect(within(directory).queryByText('李老师')).not.toBeInTheDocument();
    expect(within(directory).queryByText('王同学')).not.toBeInTheDocument();
    expect(within(directory).queryByText('账号绑定')).not.toBeInTheDocument();
    expect(within(directory).queryByText('定向邀请')).not.toBeInTheDocument();
    expect(within(directory).queryByPlaceholderText('不定向邀请位置')).not.toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /添加人员/ })).toBeInTheDocument();
    expect(within(directory).queryByRole('button', { name: /^新建人员$/ })).not.toBeInTheDocument();
    expect(
      within(directory).queryByRole('button', { name: /^不定向邀请$/ }),
    ).not.toBeInTheDocument();
    expect(within(directory).queryByRole('button', { name: /^批量导入$/ })).not.toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /导出/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: '待处理' })).toBeInTheDocument();
    expect(within(directory).queryByText(/含下级/)).not.toBeInTheDocument();
    expect(within(directory).getByText('组织身份')).toBeInTheDocument();
    expect(within(directory).getByText('教育身份')).toBeInTheDocument();
    const rootPersonRow = within(directory).getByRole('button', { name: /张扬/ });
    expect(within(rootPersonRow).getByText('所有者')).toBeInTheDocument();
    expect(within(rootPersonRow).queryByText('已注册')).not.toBeInTheDocument();

    const orgTree = within(directory).getByLabelText('组织树');
    expect(within(orgTree).getByRole('button', { name: /Seed 的组织.*1/ })).toBeInTheDocument();
    expect(within(orgTree).getByRole('button', { name: /Seed 的组织.*1/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    fireEvent.click(within(orgTree).getByRole('button', { name: /^数学组/ }));
    await waitFor(() => expect(within(directory).getAllByText('李老师').length).toBeGreaterThan(0));
    const teacherRow = within(directory).getByRole('button', { name: /李老师/ });
    expect(within(teacherRow).queryByText('邀请中')).not.toBeInTheDocument();
    expect(within(directory).getAllByText(/教师/).length).toBeGreaterThan(0);

    fireEvent.click(within(orgTree).getByRole('button', { name: /^高一 1 班/ }));
    await waitFor(() => expect(within(directory).getAllByText('王同学').length).toBeGreaterThan(0));
    const studentRow = within(directory).getByRole('button', { name: /王同学/ });
    expect(within(studentRow).getByText('成员')).toBeInTheDocument();
    expect(within(studentRow).getByText('学生')).toBeInTheDocument();
    expect(within(orgTree).getByRole('button', { name: /^高一 1 班/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(studentRow).queryByText('已注册')).not.toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /添加到当前范围/ })).toBeInTheDocument();
    expect(
      within(directory).queryByRole('button', { name: /当前节点邀请/ }),
    ).not.toBeInTheDocument();
    expect(
      within(directory).queryByRole('button', { name: /批量导入到当前节点/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(directory).getByRole('button', { name: /王同学/ }));
    const personDrawerTitle = await screen.findByText('人员详情 #102');
    const personDrawer =
      (personDrawerTitle.closest('.ant-drawer') as HTMLElement | null) || document.body;
    expect(within(personDrawer).getByText('账号绑定')).toBeInTheDocument();
    expect(within(personDrawer).getByText('定向邀请')).toBeInTheDocument();
  });

  it('lets admins create and edit organization units from the organization tree', async () => {
    let nextDirectoryPayload = directoryPayload;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(nextDirectoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/units') && init?.method === 'POST') {
        const created = {
          id: 4,
          name: '行政办公室',
          org_id: 'org-1',
          parent_id: 1,
          sort_order: 0,
          unit_type: 'department',
        };
        nextDirectoryPayload = {
          ...nextDirectoryPayload,
          units: [...nextDirectoryPayload.units, created],
        };
        return new Response(JSON.stringify(created), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/units/2') && init?.method === 'PATCH') {
        const updated = {
          ...nextDirectoryPayload.units.find((unit) => unit.id === 2)!,
          description: '负责理科教学',
          name: '理科组',
        };
        nextDirectoryPayload = {
          ...nextDirectoryPayload,
          units: nextDirectoryPayload.units.map((unit) => (unit.id === 2 ? updated : unit)),
        };
        return new Response(JSON.stringify(updated), { status: 200 });
      }
      return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    const directory = await screen.findByLabelText('组织架构工作区');
    await waitFor(() => expect(within(directory).getByLabelText('组织树')).toBeInTheDocument());
    const orgTree = within(directory).getByLabelText('组织树');
    fireEvent.click(within(orgTree).getByRole('button', { name: '在Seed 的组织下新建节点' }));
    const createNameInput = await screen.findByPlaceholderText('输入节点名称');
    const createPanel = createNameInput.closest('.ant-popover') || document.body;
    fireEvent.change(within(createPanel as HTMLElement).getByPlaceholderText('输入节点名称'), {
      target: { value: '行政办公室' },
    });
    fireEvent.mouseDown(within(createPanel as HTMLElement).getByText('选择节点类型'));
    fireEvent.click(await screen.findByTitle('部门'));
    fireEvent.mouseDown(within(createPanel as HTMLElement).getByText('选择上级节点'));
    fireEvent.click(await screen.findByTitle('Seed School / 学校'));
    fireEvent.click(within(createPanel as HTMLElement).getByRole('button', { name: '确认新建' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/units',
        expect.objectContaining({
          body: JSON.stringify({
            description: undefined,
            entry_year: undefined,
            name: '行政办公室',
            parent_id: 1,
            sort_order: 0,
            unit_type: 'department',
          }),
          method: 'POST',
        }),
      ),
    );
    await waitFor(() => expect(within(orgTree).getByText('行政办公室')).toBeInTheDocument());

    fireEvent.click(within(orgTree).getByRole('button', { name: '编辑数学组' }));
    const editNameInput = await screen.findByDisplayValue('数学组');
    const editPanel = editNameInput.closest('.ant-popover') || document.body;
    fireEvent.change(editNameInput, { target: { value: '理科组' } });
    fireEvent.change(within(editPanel as HTMLElement).getByPlaceholderText('节点说明'), {
      target: { value: '负责理科教学' },
    });
    fireEvent.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存节点' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/units/2',
        expect.objectContaining({
          body: JSON.stringify({
            description: '负责理科教学',
            entry_year: undefined,
            name: '理科组',
            parent_id: 1,
            sort_order: 0,
            unit_type: 'department',
          }),
          method: 'PATCH',
        }),
      ),
    );
    expect(within(orgTree).getByRole('button', { name: '删除理科组' })).toBeInTheDocument();
  });

  it('creates an organization-level person without a primary unit when selecting all people', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/people') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            display_name: '无层级人员',
            id: 103,
            lifecycle_status: 'active',
            org_id: 'org-1',
            primary_org_unit_id: null,
            registration_status: 'unregistered',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    const directory = await screen.findByLabelText('组织架构工作区');
    await waitFor(() => expect(within(directory).getByText('Seed School')).toBeInTheDocument());

    fireEvent.click(within(directory).getByRole('button', { name: /添加人员/ }));
    fireEvent.click(await screen.findByRole('button', { name: '新建人员' }));
    const nameInput = await screen.findByPlaceholderText('输入姓名');
    const panel = nameInput.closest('.ant-popover') || document.body;
    fireEvent.change(within(panel as HTMLElement).getByPlaceholderText('输入姓名'), {
      target: { value: '无层级人员' },
    });
    fireEvent.mouseDown(within(panel as HTMLElement).getByText('放入组织节点'));
    const rootPositionOptions = await screen.findAllByTitle('Seed 的组织');
    fireEvent.click(rootPositionOptions.at(-1)!);
    fireEvent.mouseDown(within(panel as HTMLElement).getByText('选择教育身份'));
    fireEvent.click(await screen.findByTitle('教师'));
    fireEvent.mouseDown(within(panel as HTMLElement).getByText('选择授权范围'));
    const schoolOptions = await screen.findAllByText('Seed School');
    fireEvent.click(schoolOptions.at(-1)!);
    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: '确认创建' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/people',
        expect.objectContaining({
          body: JSON.stringify({
            display_name: '无层级人员',
            email: undefined,
            education_org_unit_id: 1,
            education_role: 'teacher',
            primary_org_unit_id: null,
            roster_kind: 'teacher',
          }),
          method: 'POST',
        }),
      ),
    );
  });

  it('prefills class scoped person creation from the selected organization node', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/people') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            display_name: '预填学生',
            id: 104,
            lifecycle_status: 'active',
            org_id: 'org-1',
            primary_org_unit_id: 3,
            registration_status: 'unregistered',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    const directory = await screen.findByLabelText('组织架构工作区');
    await waitFor(() => expect(within(directory).getByLabelText('组织树')).toBeInTheDocument());
    const orgTree = within(directory).getByLabelText('组织树');
    fireEvent.click(within(orgTree).getByRole('button', { name: /^高一 1 班/ }));

    fireEvent.click(within(directory).getByRole('button', { name: /添加到当前范围/ }));
    fireEvent.click(await screen.findByRole('button', { name: '新建人员' }));
    const nameInput = await screen.findByPlaceholderText('输入姓名');
    const panel = nameInput.closest('.ant-popover') || document.body;
    fireEvent.change(within(panel as HTMLElement).getByPlaceholderText('输入姓名'), {
      target: { value: '预填学生' },
    });
    expect(within(panel as HTMLElement).getByText('学生 · 高一 1 班')).toBeInTheDocument();
    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: '确认创建' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/people',
        expect.objectContaining({
          body: JSON.stringify({
            display_name: '预填学生',
            email: undefined,
            education_org_unit_id: 3,
            education_role: 'student',
            primary_org_unit_id: 3,
            roster_kind: 'student',
          }),
          method: 'POST',
        }),
      ),
    );
  });

  it('opens identity claim drawer from the organization action query', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims?status=all')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims')) {
        return new Response(
          JSON.stringify({
            better_auth_user_id: 'user-member',
            id: 31,
            org_id: 'org-1',
            requested_by_user_id: 'user-member',
            roster_id: 301,
            roster_kind: 'teacher',
            status: 'pending',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(memberOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/organization?action=identity-claim']}>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    const drawer = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(drawer).getAllByText('提交身份申请').length).toBeGreaterThan(0),
    );
    expect(screen.getByRole('button', { name: /提交身份申请/ })).toBeInTheDocument();
    expect(within(drawer).getByPlaceholderText('输入姓名搜索教师或学生')).toBeInTheDocument();
    expect(within(drawer).queryByText(/审批/)).not.toBeInTheDocument();
    expect(within(drawer).queryByText('李老师')).not.toBeInTheDocument();
    expect(within(drawer).getByText('请输入姓名搜索可申请的教师或学生')).toBeInTheDocument();
    fireEvent.change(within(drawer).getByPlaceholderText('输入姓名搜索教师或学生'), {
      target: { value: '李' },
    });
    await waitFor(() => expect(within(drawer).getByText('李老师')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '身份绑定' })).not.toBeInTheDocument();

    const claimButton = within(drawer)
      .getAllByRole('button', { name: /申请绑定/ })
      .find((button) => !button.hasAttribute('disabled'));
    expect(claimButton).toBeDefined();
    fireEvent.click(claimButton!);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/identity-claims',
        expect.objectContaining({
          body: JSON.stringify({ roster_id: 301, roster_kind: 'teacher' }),
          method: 'POST',
        }),
      ),
    );
  });

  it('reopens identity claim drawer when the identity application entry is triggered on the same route', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims?status=all')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(memberOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/organization?action=identity-claim']}>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new Event('askcore:identity-claim-open'));
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('输入姓名搜索教师或学生')).toBeInTheDocument();
  });

  it('opens the application form by default for organization admins and keeps approval reachable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims?status=all')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims?status=pending')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                better_auth_user_id: 'other-user',
                id: 41,
                org_id: 'org-1',
                requested_by_user_id: 'other-user',
                roster_id: 301,
                roster_kind: 'teacher',
                status: 'pending',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/organization?action=identity-claim']}>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('身份申请与审批')).toBeInTheDocument());
    const drawer = screen.getByRole('dialog');
    await waitFor(() => expect(within(drawer).getByText('提交身份申请')).toBeInTheDocument());
    expect(within(drawer).getByText('提交申请')).toBeInTheDocument();
    expect(within(drawer).getByText('身份审批')).toBeInTheDocument();
    fireEvent.change(within(drawer).getByPlaceholderText('输入姓名搜索教师或学生'), {
      target: { value: '李' },
    });
    expect(within(drawer).getByText('李老师')).toBeInTheDocument();
    expect(within(drawer).queryByText('暂无待审批身份申请')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/workbench/organization/identity-claims?status=all',
      expect.any(Object),
    );

    fireEvent.click(within(drawer).getByRole('button', { name: '身份审批' }));

    await waitFor(() => expect(within(drawer).getByText('待处理 1 个')).toBeInTheDocument());
    expect(within(drawer).getByText('申请账号 other-user')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/workbench/organization/identity-claims?status=pending',
      expect.any(Object),
    );
  });

  it('does not support the legacy identity tab query as an identity application entry', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(directoryPayload), { status: 200 });
      }
      return new Response(JSON.stringify(memberOrganizationPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/organization?tab=identity']}>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('组织架构工作区')).toBeInTheDocument());
    expect(screen.queryByText('身份申请与审批')).not.toBeInTheDocument();
  });
});
