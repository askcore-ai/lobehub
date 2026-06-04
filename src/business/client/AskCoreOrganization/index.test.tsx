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
              units: [
                {
                  entry_year: 2025,
                  id: 1,
                  name: '2025级',
                  org_id: 'org-1',
                  sort_order: 0,
                  unit_type: 'cohort',
                },
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
    expect(screen.queryByRole('button', { name: '教学年级' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '学科' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '成员' }));
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '层级' }));
    await waitFor(() => expect(screen.getByText('教育组织')).toBeInTheDocument());
    expect(screen.getAllByText('成员').length).toBeGreaterThan(0);
    expect(screen.getByText('2025级')).toBeInTheDocument();
    expect(screen.getAllByText('Seed 的组织').length).toBeGreaterThan(0);
  });

  it('renders tree-only creation controls and a node-scoped role panel without raw ID inputs', async () => {
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
                {
                  entry_year: 2025,
                  id: 2,
                  name: '2025级',
                  org_id: 'org-1',
                  parent_id: 1,
                  sort_order: 0,
                  unit_type: 'cohort',
                },
                {
                  id: 3,
                  name: '高一 1 班',
                  org_id: 'org-1',
                  parent_id: 2,
                  sort_order: 0,
                  unit_type: 'class',
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/workbench/organization/roles')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 10,
                  org_id: 'org-1',
                  org_unit_id: 3,
                  role: 'teacher',
                  subject_user_id: 'teacher-subject',
                  teacher_id: 9001,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/askcore/workbench/teachers')) {
          return new Response(
            JSON.stringify({
              has_more: false,
              items: [{ id: 9001, real_name: '李老师', teacher_id: 9001 }],
              page: 1,
              page_size: 100,
              resource: 'teachers',
              total: 1,
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/askcore/workbench/students')) {
          return new Response(
            JSON.stringify({
              has_more: false,
              items: [{ id: 7001, name: '王同学', student_id: 7001, student_number: 'S001' }],
              page: 1,
              page_size: 100,
              resource: 'students',
              total: 1,
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

    expect(screen.getByLabelText('新建学校')).toBeInTheDocument();
    expect(screen.queryByText('添加学校')).not.toBeInTheDocument();
    expect(screen.getByText('选择树上的节点分配身份')).toBeInTheDocument();
    expect(screen.getByText('届别')).toBeInTheDocument();
    expect(screen.queryByLabelText('学校名称')).not.toBeInTheDocument();
    expect(screen.queryByText('创建层级')).not.toBeInTheDocument();
    expect(screen.queryByText('上级 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Better Auth 用户 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('教师 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('学生 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('对象类型')).not.toBeInTheDocument();
    expect(screen.queryByText('组织层级')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed School'));
    await waitFor(() => expect(screen.getByText('Seed School 的身份')).toBeInTheDocument());
    const rolePanel = screen.getByLabelText('身份分配');
    expect(screen.getByText('学校管理者')).toBeInTheDocument();
    expect(within(rolePanel).queryByText('学生')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('高一 1 班'));
    await waitFor(() => expect(screen.getByText('高一 1 班 的身份')).toBeInTheDocument());
    expect(screen.getByText('班主任')).toBeInTheDocument();
    expect(screen.getByText('李老师')).toBeInTheDocument();
    expect(screen.queryByText(/9001/)).not.toBeInTheDocument();
  });

  it('submits student roster form values after validation', async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workbench/organization/units')) {
        return new Response(JSON.stringify({ org_id: 'org-1', units: [] }), { status: 200 });
      }
      if (url.includes('/api/askcore/workbench/students') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 7002, resource: 'students' }), { status: 200 });
      }
      if (url.includes('/api/askcore/workbench/students')) {
        return new Response(
          JSON.stringify({
            has_more: false,
            items: [],
            page: 1,
            page_size: 20,
            resource: 'students',
            total: 0,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/askcore/workbench/teachers')) {
        return new Response(
          JSON.stringify({
            has_more: false,
            items: [],
            page: 1,
            page_size: 100,
            resource: 'teachers',
            total: 0,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AskCoreOrganizationRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('组织设置').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '学生' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /新建学生/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /新建学生/ }));
    fireEvent.change(await screen.findByLabelText('学号'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '杨博宇' } });
    fireEvent.click(screen.getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).includes('/api/askcore/workbench/students') && init?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        payload: {
          name: '杨博宇',
          student_number: '60',
        },
      });
    });
  }, 20_000);
});
