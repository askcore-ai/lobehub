import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreSchoolPortalRoute } from './index';

const readyPortal = (canManageIntegrations = false) => ({
  can_manage_integrations: canManageIntegrations,
  contract: 'askcore.school-portal.v2',
  schools: [
    {
      destinations: [
        {
          description: '课程、作业、提交与成绩',
          key: 'teaching',
          label: '教学中心',
          launch_url: 'about:blank#teaching-launch',
          session_launch_url: '/api/askcore/school/launch/opaque-teaching-session',
        },
        {
          description: '校务资料与学校服务',
          key: 'school-services',
          label: '校务中心',
          launch_url: 'about:blank#services-launch',
          session_launch_url: '/api/askcore/school/launch/opaque-services-session',
        },
      ],
      key: 'askcore-online-school',
      name: 'AskCore 在线学校',
      role_source_url: '/school/services/askcore/session.php',
    },
  ],
  selection_required: false,
  show_school_entry: true,
  state: 'ready',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AskCoreSchoolPortalRoute', () => {
  it('renders the Gibbon school surface directly without destination cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByTitle('AskCore 在线学校 学校')).toHaveAttribute(
      'src',
      'about:blank#services-launch',
    );
    expect(screen.queryByLabelText('进入学习空间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('进入校务中心')).not.toBeInTheDocument();
    expect(screen.queryByText(/deployment|actor_hash|account_user_id/i)).not.toBeInTheDocument();
  });

  it('renders the live-role Moodle surface directly for a student', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school/learning']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByText('学习空间')).toBeInTheDocument();
    expect(screen.getByTitle('AskCore 在线学校 学习空间')).toHaveAttribute(
      'src',
      'about:blank#teaching-launch',
    );
  });

  it('renders an actionable source-unavailable state without a legacy binding fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          can_manage_integrations: false,
          contract: 'askcore.school-portal.v2',
          schools: [],
          selection_required: false,
          show_school_entry: true,
          state: 'unavailable',
        }),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByText('学校连接暂不可用')).toBeInTheDocument();
    expect(screen.getByText(/个人空间仍可正常使用/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/绑定邀请|当前组织/)).not.toBeInTheDocument());
  });

  it('shows a redacted integration summary only when the backend grants system access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/operations')) {
          return Response.json({
            production_preflight: {
              active_deployments: 1,
              preflight_status: 'passed',
              status: 'succeeded',
            },
            redaction_passed: true,
            roster_projection_rows: 0,
            status: 'succeeded',
          });
        }
        if (String(input).includes('/askcore/session.php')) {
          return Response.json({ authenticated: true, role: 'administrator' });
        }
        return Response.json(readyPortal(true));
      }),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByText('系统集成')).toBeInTheDocument();
    expect(await screen.findAllByText('已就绪')).toHaveLength(1);
    expect(screen.getByText('教学处理连接')).toBeInTheDocument();
    expect(screen.getByText('已通过')).toBeInTheDocument();
    expect(screen.getByText('未保存')).toBeInTheDocument();
    expect(screen.queryByText(/client_id|deployment_id|issuer/i)).not.toBeInTheDocument();
  });
});
