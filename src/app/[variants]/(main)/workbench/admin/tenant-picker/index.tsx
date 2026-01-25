'use client';

import { setCookie } from '@lobechat/utils';
import { Flexbox } from '@lobehub/ui';
import { App, Button, Select, Space, Typography } from 'antd';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import NavHeader from '@/features/NavHeader';

const COOKIE_NAME = 'workbench_admin_tenant_id';
const COOKIE_EXPIRE_DAYS = 30;

interface TenantRow {
  auth_org_id: string | null;
  auth_org_name: string | null;
  is_active: boolean;
  name: string;
  tenant_id: number;
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
};

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return;
  const raw = document.cookie || '';
  const parts = raw.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq);
    if (k !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
};

const writeCookie = (name: string, value: string): void => {
  if (typeof document === 'undefined') return;
  setCookie(name, encodeURIComponent(value), COOKIE_EXPIRE_DAYS);
};

const clearCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  setCookie(name, undefined);
};

const TenantPicker = memo(() => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(() => {
    const raw = readCookie(COOKIE_NAME);
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  const {
    data: tenants = [],
    error,
    isLoading,
  } = useSWR<TenantRow[]>(
    'workbench:admin:tenants',
    () => fetchJson('/api/workbench/admin/tenants'),
    {
      shouldRetryOnError: false,
    },
  );

  useEffect(() => {
    if (!tenants.length) return;

    const stillValid =
      selectedTenantId !== null && tenants.some((t) => t.tenant_id === selectedTenantId);
    if (stillValid) return;

    const first = tenants[0];
    setSelectedTenantId(first.tenant_id);
    writeCookie(COOKIE_NAME, String(first.tenant_id));
    message.info(`Tenant selected: ${first.name} (#${first.tenant_id})`);
  }, [message, selectedTenantId, tenants]);

  const options = useMemo(
    () =>
      tenants.map((t) => ({
        label: `${t.name} (#${t.tenant_id})${t.is_active ? '' : ' [inactive]'}${
          t.auth_org_id ? ` · ${t.auth_org_id}` : ''
        }`,
        value: t.tenant_id,
      })),
    [tenants],
  );

  if (isLoading) return <Loading debugId={'WorkbenchTenantPicker'} />;

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader />

      <Flexbox gap={16} padding={16} style={{ overflow: 'auto' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Tenant Picker
        </Typography.Title>

        <Typography.Paragraph style={{ margin: 0 }} type="secondary">
          This selection filters Task Center and Workspace run lists for system admins.
        </Typography.Paragraph>

        {error ? (
          <Flexbox gap={8}>
            <Typography.Text type="danger">
              Not authorized or failed to load tenants.
            </Typography.Text>
            <Typography.Text type="secondary">
              {error instanceof Error ? error.message : String(error)}
            </Typography.Text>
            <Button onClick={() => navigate('/workbench/task-center')}>Back</Button>
          </Flexbox>
        ) : tenants.length === 0 ? (
          <Typography.Text type="secondary">No tenants found yet.</Typography.Text>
        ) : (
          <Flexbox gap={12}>
            <Space wrap>
              <Select
                onChange={(value) => {
                  setSelectedTenantId(value);
                  writeCookie(COOKIE_NAME, String(value));
                  message.success('Tenant selection saved');
                }}
                options={options}
                placeholder="Select a tenant"
                style={{ minWidth: 360 }}
                value={selectedTenantId ?? undefined}
              />
              <Button
                onClick={() => {
                  setSelectedTenantId(null);
                  clearCookie(COOKIE_NAME);
                  message.info('Tenant selection cleared');
                }}
              >
                Clear
              </Button>
            </Space>

            <Space wrap>
              <Button onClick={() => navigate('/workbench/task-center')}>Task Center</Button>
              <Button onClick={() => navigate('/workbench/workspace')}>Workspace</Button>
            </Space>
          </Flexbox>
        )}
      </Flexbox>
    </Flexbox>
  );
});

export default TenantPicker;
