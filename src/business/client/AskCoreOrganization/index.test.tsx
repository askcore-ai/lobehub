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
      primary_org_unit_id: 10,
      registration_status: 'registered',
    },
  ],
  authorizations: [
    {
      id: 900,
      org_id: 'org-1',
      org_unit_id: 3,
      person_id: 101,
      role: 'teacher',
      subject_user_id: 'user:directory-person-101',
    },
    {
      id: 901,
      org_id: 'org-1',
      org_unit_id: 3,
      person_id: 102,
      role: 'student',
      subject_user_id: 'user:directory-person-102',
    },
    {
      better_auth_user_id: 'user-owner',
      id: 902,
      org_id: 'org-1',
      org_unit_id: 10,
      person_id: 103,
      role: 'teacher',
      subject_user_id: 'user:user-owner',
    },
  ],
  units: [
    {
      id: 10,
      name: 'org-1',
      org_id: 'org-1',
      sort_order: -1000,
      unit_type: 'organization',
    },
    {
      id: 1,
      name: 'Seed School',
      org_id: 'org-1',
      parent_id: 10,
      sort_order: 0,
      unit_type: 'school',
    },
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
          return new Response(JSON.stringify({ items: directoryPayload.authorizations }), {
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
    expect(screen.getByRole('button', { name: /org-1/ })).toBeInTheDocument();
    expect(screen.queryByText('组织 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('组织名称')).not.toBeInTheDocument();
    expect(screen.queryByText('组织简介')).not.toBeInTheDocument();
    expect(screen.queryByText('联系人')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '身份绑定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '教师' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '学生' })).not.toBeInTheDocument();
    expect(screen.getByText('1 注册成员')).toBeInTheDocument();
    expect(screen.queryByText('注册成员')).not.toBeInTheDocument();

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
    expect(within(directory).queryByRole('button', { name: /^待处理/ })).not.toBeInTheDocument();
    expect(within(directory).queryByText(/含下级/)).not.toBeInTheDocument();
    expect(within(directory).getByText('权限')).toBeInTheDocument();
    expect(within(directory).getByText('角色')).toBeInTheDocument();
    const rootPersonRow = within(directory).getByRole('button', { name: /张扬/ });
    expect(within(rootPersonRow).getByText('所有者')).toBeInTheDocument();
    expect(within(rootPersonRow).getByText('Seed 的组织')).toBeInTheDocument();
    expect(within(rootPersonRow).queryByText('组织本级')).not.toBeInTheDocument();
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

  it('lets admins edit basic person information from the detail drawer', async () => {
    let nextDirectoryPayload = {
      ...directoryPayload,
      people: directoryPayload.people.map((person) =>
        person.id === 103
          ? { ...person, email: 'old@askcore.cn', phone: '13800000000' }
          : person,
      ),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(nextDirectoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/people/103') && init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body));
        nextDirectoryPayload = {
          ...nextDirectoryPayload,
          people: nextDirectoryPayload.people.map((person) =>
            person.id === 103 ? { ...person, ...patch } : person,
          ),
        };
        return new Response(JSON.stringify(nextDirectoryPayload.people.find((p) => p.id === 103)), {
          status: 200,
        });
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
    await waitFor(() => expect(within(directory).getByText('张扬')).toBeInTheDocument());
    fireEvent.click(within(directory).getByRole('button', { name: /张扬/ }));
    const drawerTitle = await screen.findByText('人员详情 #103');
    const drawer = (drawerTitle.closest('.ant-drawer') as HTMLElement | null) || document.body;

    fireEvent.change(within(drawer).getByPlaceholderText('姓名'), {
      target: { value: '张扬老师' },
    });
    fireEvent.change(within(drawer).getByPlaceholderText('邮箱'), {
      target: { value: 'zhangyang@askcore.cn' },
    });
    fireEvent.change(within(drawer).getByPlaceholderText('手机号'), {
      target: { value: '13900000000' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: '保存资料' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/people/103',
        expect.objectContaining({
          body: JSON.stringify({
            display_name: '张扬老师',
            email: 'zhangyang@askcore.cn',
            phone: '13900000000',
          }),
          method: 'PATCH',
        }),
      ),
    );
    await waitFor(() => expect(within(directory).getAllByText('张扬老师').length).toBeGreaterThan(0));
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
    fireEvent.click(await screen.findByTitle('Seed 的组织 / Seed School / 学校'));
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

  it('creates an organization-level person at the concrete root node', async () => {
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
            primary_org_unit_id: 10,
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
    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: '确认创建' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/organization/people',
        expect.objectContaining({
          body: JSON.stringify({
            display_name: '无层级人员',
            email: undefined,
            education_org_unit_id: 10,
            education_role: 'teacher',
            primary_org_unit_id: 10,
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
            roster_id: 101,
            roster_kind: 'member',
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
    expect(within(drawer).getByPlaceholderText('输入姓名搜索人员')).toBeInTheDocument();
    expect(within(drawer).queryByText(/审批/)).not.toBeInTheDocument();
    expect(within(drawer).queryByText('李老师')).not.toBeInTheDocument();
    expect(within(drawer).getByText('请输入姓名搜索可申请的人员')).toBeInTheDocument();
    fireEvent.change(within(drawer).getByPlaceholderText('输入姓名搜索人员'), {
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
          body: JSON.stringify({ roster_id: 101, roster_kind: 'member' }),
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
    expect(screen.getByPlaceholderText('输入姓名搜索人员')).toBeInTheDocument();
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
                roster_id: 101,
                roster_kind: 'member',
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
    fireEvent.change(within(drawer).getByPlaceholderText('输入姓名搜索人员'), {
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

  it('renders P50 person authorizations without todo aggregation or roster fallback', async () => {
    const p50DirectoryPayload = {
      ...directoryPayload,
      authorizations: [
        {
          better_auth_user_id: 'user-owner',
          id: 910,
          org_id: 'org-1',
          org_unit_id: 10,
          person_id: 103,
          role: 'teacher',
          subject_user_id: 'user:user-owner',
        },
      ],
      people: [
        {
          better_auth_user_id: 'user-owner',
          display_name: '张扬',
          id: 103,
          lifecycle_status: 'active',
          org_id: 'org-1',
          primary_org_unit_id: 10,
          registration_status: 'registered',
        },
        {
          better_auth_user_id: 'user-student',
          display_name: '王同学',
          id: 104,
          lifecycle_status: 'active',
          org_id: 'org-1',
          primary_org_unit_id: 10,
          registration_status: 'registered',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/workbench/organization/directory')) {
          return new Response(JSON.stringify(p50DirectoryPayload), { status: 200 });
        }
        if (url.endsWith('/workbench/organization/identity-claims?status=all')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response(JSON.stringify(activeOrganizationPayload), { status: 200 });
      }),
    );

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    const directory = await screen.findByLabelText('组织架构工作区');
    await waitFor(() => expect(within(directory).getByText('张扬')).toBeInTheDocument());

    expect(within(directory).getByText('权限')).toBeInTheDocument();
    expect(within(directory).getByText('角色')).toBeInTheDocument();
    expect(within(directory).queryByText('组织身份')).not.toBeInTheDocument();
    expect(within(directory).queryByText('教育授权')).not.toBeInTheDocument();
    expect(within(directory).queryByText('教育身份')).not.toBeInTheDocument();
    expect(within(directory).queryByRole('button', { name: /^待处理/ })).not.toBeInTheDocument();
    expect(within(directory).queryByText(/^身份待审/)).not.toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /^筛选待补全身份/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /^筛选邀请中/ })).toBeInTheDocument();

    const ownerRow = within(directory).getByRole('button', { name: /张扬/ });
    expect(within(ownerRow).getByText('所有者')).toBeInTheDocument();
    expect(within(ownerRow).getByText('教师')).toBeInTheDocument();

    const studentRow = within(directory).getByRole('button', { name: /王同学/ });
    expect(within(studentRow).getByText('成员')).toBeInTheDocument();
    expect(within(studentRow).getByText('待指定')).toBeInTheDocument();
    expect(within(studentRow).getByText('Seed 的组织')).toBeInTheDocument();
    expect(within(studentRow).queryByText('组织本级')).not.toBeInTheDocument();
    expect(within(studentRow).queryByText('学生')).not.toBeInTheDocument();
  });

  it('lets owners remove bound organization members from the directory drawer', async () => {
    const removableDirectoryPayload = {
      ...directoryPayload,
      people: [
        {
          better_auth_user_id: 'user-owner',
          display_name: '张扬',
          id: 103,
          lifecycle_status: 'active',
          org_id: 'org-1',
          primary_org_unit_id: 10,
          registration_status: 'registered',
        },
        {
          better_auth_user_id: 'user-student',
          display_name: '王同学',
          id: 104,
          lifecycle_status: 'active',
          org_id: 'org-1',
          primary_org_unit_id: 10,
          registration_status: 'registered',
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/askcore/organizations/org-1/members/mem-student')) {
        return new Response(JSON.stringify({ members: [] }), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/directory')) {
        return new Response(JSON.stringify(removableDirectoryPayload), { status: 200 });
      }
      if (url.endsWith('/workbench/organization/identity-claims?status=all')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
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
    const studentRow = await within(directory).findByRole('button', { name: /王同学/ });
    fireEvent.click(studentRow);

    await screen.findByText('组织成员');
    const removeButtons = screen.getAllByRole('button', { name: '移出组织' });
    fireEvent.click(removeButtons[0]);
    const confirmButtons = await screen.findAllByRole('button', { name: '移出组织' });
    fireEvent.click(confirmButtons.at(-1)!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/organizations/org-1/members/mem-student',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
