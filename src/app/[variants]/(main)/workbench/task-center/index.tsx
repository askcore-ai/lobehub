'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Button, Descriptions, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import NavHeader from '@/features/NavHeader';

type WorkbenchRun = {
  created_at: string;
  failure_reason: string | null;
  finished_at: string | null;
  input: Record<string, unknown>;
  original_run_id: number | null;
  run_id: number;
  started_at: string | null;
  state: string;
  tenant_id: number;
  tracing_degraded: boolean;
  user_id: string;
  workflow_name: string;
};

type WorkbenchTraceLink = { trace_link: string };

type WorkbenchStreamEvent = {
  payload: Record<string, unknown>;
  seq: number;
  state: string;
  type: string;
};

// eslint-disable-next-line no-undef
const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
};

// eslint-disable-next-line no-undef
const fetchOk = async (url: string, init?: RequestInit): Promise<void> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
};

const stateTag = (state: string) => {
  switch (state) {
    case 'queued':
    case 'starting': {
      return <Tag color="blue">{state}</Tag>;
    }
    case 'running': {
      return <Tag color="processing">{state}</Tag>;
    }
    case 'waiting_for_input': {
      return <Tag color="gold">{state}</Tag>;
    }
    case 'succeeded': {
      return <Tag color="success">{state}</Tag>;
    }
    case 'failed': {
      return <Tag color="error">{state}</Tag>;
    }
    case 'cancelled': {
      return <Tag>{state}</Tag>;
    }
    default: {
      return <Tag>{state}</Tag>;
    }
  }
};

const TaskCenter = memo(() => {
  const { t } = useTranslation('common');
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { runId } = useParams();

  const [events, setEvents] = useState<WorkbenchStreamEvent[]>([]);
  const [inputJson, setInputJson] = useState('{\n  \n}');

  const {
    data: runs = [],
    isLoading: isLoadingRuns,
    mutate: mutateRuns,
  } = useSWR<WorkbenchRun[]>('workbench:runs', () => fetchJson('/api/workbench/runs'), {
    refreshInterval: 2000,
  });

  const {
    data: run,
    isLoading: isLoadingRun,
    mutate: mutateRun,
  } = useSWR<WorkbenchRun>(
    runId ? `workbench:run:${runId}` : null,
    () => fetchJson(`/api/workbench/runs/${runId}`),
    { refreshInterval: 2000 },
  );

  const { data: traceLink } = useSWR<WorkbenchTraceLink | undefined>(
    runId ? `workbench:trace:${runId}` : null,
    async () => {
      try {
        return await fetchJson<WorkbenchTraceLink>(`/api/workbench/runs/${runId}/trace`, {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return undefined;
      }
    },
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (!runId) return;

    setEvents([]);

    const es = new EventSource(`/api/workbench/runs/${encodeURIComponent(runId)}/events/stream`);

    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as WorkbenchStreamEvent;
        setEvents((prev) => [...prev, payload].slice(-500));
      } catch {
        // ignore malformed events
      }
    };

    const onError = () => {
      es.close();
    };

    es.addEventListener('message', onMessage);
    es.addEventListener('error', onError);

    return () => {
      es.removeEventListener('message', onMessage);
      es.removeEventListener('error', onError);
      es.close();
    };
  }, [runId]);

  const handleCancel = async (targetRunId: number) => {
    Modal.confirm({
      content: `Cancel run ${targetRunId}?`,
      okText: t('confirm'),
      onOk: async () => {
        await fetchJson(`/api/workbench/runs/${targetRunId}/cancel`, { method: 'POST' });
        await Promise.all([mutateRuns(), mutateRun()]);
        message.success('Cancelled');
      },
      title: 'Confirm cancel',
    });
  };

  const handleRetry = async (targetRunId: number) => {
    Modal.confirm({
      content: `Retry run ${targetRunId}? This creates a new run.`,
      okText: t('confirm'),
      onOk: async () => {
        await fetchJson(`/api/workbench/runs/${targetRunId}/retry`, { method: 'POST' });
        await Promise.all([mutateRuns(), mutateRun()]);
        message.success('Retry started');
      },
      title: 'Confirm retry',
    });
  };

  const handleSubmitInput = async (targetRunId: number) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Invalid JSON');
      return;
    }

    await fetchOk(`/api/workbench/runs/${targetRunId}/input`, {
      body: JSON.stringify({ input: parsed }),
      method: 'POST',
    });
    await Promise.all([mutateRuns(), mutateRun()]);
    message.success('Input submitted');
  };

  const columns = useMemo<ColumnsType<WorkbenchRun>>(
    () => [
      {
        dataIndex: 'run_id',
        key: 'run_id',
        title: 'Run',
      },
      {
        dataIndex: 'workflow_name',
        key: 'workflow_name',
        title: 'Workflow',
      },
      {
        dataIndex: 'state',
        key: 'state',
        render: (value: string) => stateTag(value),
        title: 'State',
      },
      {
        key: 'tracing',
        render: (_, record) =>
          record.tracing_degraded ? <Tag color="warning">tracing degraded</Tag> : null,
        title: 'Tracing',
      },
      {
        key: 'actions',
        render: (_, record) => (
          <Space>
            <Button
              onClick={() => navigate(`/workbench/task-center/${record.run_id}`)}
              size="small"
            >
              Open
            </Button>
            <Button
              danger
              disabled={
                record.state === 'succeeded' ||
                record.state === 'failed' ||
                record.state === 'cancelled'
              }
              onClick={() => handleCancel(record.run_id)}
              size="small"
            >
              Cancel
            </Button>
            <Button onClick={() => handleRetry(record.run_id)} size="small">
              Retry
            </Button>
          </Space>
        ),
        title: 'Actions',
      },
    ],
    [handleCancel, handleRetry, navigate, t],
  );

  const isLoading = isLoadingRuns || (runId ? isLoadingRun : false);
  if (isLoading) return <Loading debugId={'WorkbenchTaskCenter'} />;

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader />

      <Flexbox gap={16} padding={16} style={{ overflow: 'auto' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Task Center
        </Typography.Title>

        {!runId ? (
          <Table
            columns={columns}
            dataSource={runs}
            pagination={{ pageSize: 20 }}
            rowKey={(r) => r.run_id}
            size="small"
          />
        ) : (
          <Flexbox gap={16}>
            <Space>
              <Button onClick={() => navigate('/workbench/task-center')}>Back</Button>
              {run ? (
                <>
                  <Button
                    danger
                    disabled={['succeeded', 'failed', 'cancelled'].includes(run.state)}
                    onClick={() => handleCancel(run.run_id)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => handleRetry(run.run_id)}>Retry</Button>
                  <Button onClick={() => navigate(`/workbench/workspace?runId=${run.run_id}`)}>
                    Workspace
                  </Button>
                </>
              ) : null}
            </Space>

            {run ? (
              <Descriptions bordered column={1} size="small" title={`Run ${run.run_id}`}>
                <Descriptions.Item label="Workflow">{run.workflow_name}</Descriptions.Item>
                <Descriptions.Item label="State">{stateTag(run.state)}</Descriptions.Item>
                <Descriptions.Item label="Tenant">{run.tenant_id}</Descriptions.Item>
                <Descriptions.Item label="User">{run.user_id}</Descriptions.Item>
                <Descriptions.Item label="Created">{run.created_at}</Descriptions.Item>
                <Descriptions.Item label="Started">{run.started_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="Finished">{run.finished_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="Original Run">
                  {run.original_run_id || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Failure">{run.failure_reason || '-'}</Descriptions.Item>
                <Descriptions.Item label="Tracing">
                  {run.tracing_degraded ? (
                    <Tag color="warning">degraded</Tag>
                  ) : (
                    <Tag color="success">ok</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Trace Link">
                  {traceLink?.trace_link ? (
                    <a href={traceLink.trace_link} rel="noreferrer" target="_blank">
                      Open trace
                    </a>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Text type="secondary">Run not found.</Typography.Text>
            )}

            {run?.state === 'waiting_for_input' ? (
              <Flexbox gap={8}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  Waiting for input
                </Typography.Title>
                <Input.TextArea
                  onChange={(e) => setInputJson(e.target.value)}
                  rows={6}
                  value={inputJson}
                />
                <Button onClick={() => handleSubmitInput(run.run_id)} type="primary">
                  Submit input
                </Button>
              </Flexbox>
            ) : null}

            <Flexbox gap={8}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                Events
              </Typography.Title>
              <Flexbox
                gap={6}
                style={{
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 8,
                  maxHeight: 360,
                  overflow: 'auto',
                  padding: 12,
                }}
              >
                {events.length === 0 ? (
                  <Typography.Text type="secondary">No events yet.</Typography.Text>
                ) : (
                  events
                    .slice()
                    .reverse()
                    .map((ev) => (
                      <Typography.Text code key={ev.seq}>
                        {ev.seq} {ev.type} {ev.state}
                      </Typography.Text>
                    ))
                )}
              </Flexbox>
            </Flexbox>
          </Flexbox>
        )}
      </Flexbox>
    </Flexbox>
  );
});

export default TaskCenter;
