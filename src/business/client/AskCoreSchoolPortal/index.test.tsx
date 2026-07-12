import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreSchoolPortalRoute } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AskCoreSchoolPortalRoute', () => {
  it('renders only safe launch cards for a linked school', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          can_manage_integrations: false,
          contract: 'askcore.school-portal.v1',
          schools: [
            {
              destinations: [
                {
                  description: '课程、作业、提交与成绩',
                  key: 'teaching',
                  label: '教学中心',
                  launch_url: '/api/askcore/school/launch/opaque-teaching',
                },
                {
                  description: '校务资料与学校服务',
                  key: 'school-services',
                  label: '校务中心',
                  launch_url: '/api/askcore/school/launch/opaque-services',
                },
              ],
              key: 'pilot-school',
              name: 'AskCore 试点学校',
            },
          ],
          selection_required: false,
          show_school_entry: true,
          state: 'ready',
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

    expect(await screen.findByText('AskCore 试点学校')).toBeInTheDocument();
    expect(screen.getByText('教学中心')).toBeInTheDocument();
    expect(screen.getByText('校务中心')).toBeInTheDocument();
    expect(screen.getByLabelText('进入教学中心')).toHaveAttribute(
      'href',
      '/api/askcore/school/launch/opaque-teaching',
    );
    expect(screen.queryByText(/deployment|actor_hash|account_user_id/i)).not.toBeInTheDocument();
  });

  it('renders an actionable unlinked state without local organization claims', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          can_manage_integrations: false,
          contract: 'askcore.school-portal.v1',
          schools: [],
          selection_required: false,
          show_school_entry: false,
          state: 'unlinked',
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

    expect(await screen.findByText('尚未连接学校身份')).toBeInTheDocument();
    expect(screen.getByText(/学校管理员发出的绑定邀请/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('当前组织')).not.toBeInTheDocument());
  });

  it('shows a redacted integration summary only when the backend grants system access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/operations')) {
          return Response.json({
            live_pilot_connection: { connection_ready: false },
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
        return Response.json({
          can_manage_integrations: true,
          contract: 'askcore.school-portal.v1',
          schools: [],
          selection_required: false,
          show_school_entry: true,
          state: 'unlinked',
        });
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
