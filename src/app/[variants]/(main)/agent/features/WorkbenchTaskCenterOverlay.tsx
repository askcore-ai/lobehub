'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Badge, Button, Drawer, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import { useAgentContext } from './Conversation/useAgentContext';

type WorkbenchRun = {
  conversation_id: string | null;
  created_at: string;
  finished_at: string | null;
  invocation_id: string | null;
  run_id: number;
  started_at: string | null;
  state: string;
  workflow_name: string;
};

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

export const WorkbenchTaskCenterOverlay = memo(() => {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);

  const { topicId, threadId } = useAgentContext();
  const conversationId = threadId
    ? `lc_thread:${threadId}`
    : topicId
      ? `lc_topic:${topicId}`
      : null;

  const prevRunIds = useRef<Set<number>>(new Set());

  const {
    data: runs = [],
    isLoading,
    mutate,
  } = useSWR<WorkbenchRun[]>(
    conversationId ? ['workbench:runs', conversationId] : null,
    async ([, conversationId]: readonly [string, string]) =>
      fetchJson(`/api/workbench/runs?conversation_id=${encodeURIComponent(conversationId)}`),
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    const ids = new Set(runs.map((r) => r.run_id));

    if (prevRunIds.current.size > 0) {
      for (const id of ids) {
        if (!prevRunIds.current.has(id)) {
          setOpen(true);
          break;
        }
      }
    }

    prevRunIds.current = ids;
  }, [runs]);

  const activeCount = useMemo(
    () => runs.filter((r) => !['succeeded', 'failed', 'cancelled'].includes(r.state)).length,
    [runs],
  );

  const handleCancel = async (runId: number) => {
    Modal.confirm({
      content: `Cancel run ${runId}?`,
      okText: 'Confirm',
      onOk: async () => {
        await fetchJson(`/api/workbench/runs/${runId}/cancel`, { method: 'POST' });
        await mutate();
        message.success('Cancelled');
      },
      title: 'Confirm cancel',
    });
  };

  const handleRetry = async (runId: number) => {
    Modal.confirm({
      content: `Retry run ${runId}? This creates a new run.`,
      okText: 'Confirm',
      onOk: async () => {
        await fetchJson(`/api/workbench/runs/${runId}/retry`, { method: 'POST' });
        await mutate();
        message.success('Retry started');
      },
      title: 'Confirm retry',
    });
  };

  const columns = useMemo<ColumnsType<WorkbenchRun>>(
    () => [
      { dataIndex: 'run_id', key: 'run_id', title: 'Run' },
      { dataIndex: 'workflow_name', key: 'workflow_name', title: 'Workflow' },
      {
        dataIndex: 'state',
        key: 'state',
        render: (value: string) => stateTag(value),
        title: 'State',
      },
      {
        key: 'actions',
        render: (_, record) => (
          <Space>
            <Button
              onClick={() => {
                if (!conversationId) return;
                useChatStore.getState().pushPortalView({
                  conversationId,
                  runId: record.run_id,
                  type: PortalViewType.Workbench,
                });
              }}
              size="small"
            >
              Artifacts
            </Button>
            <Button
              danger
              disabled={['succeeded', 'failed', 'cancelled'].includes(record.state)}
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
    [conversationId],
  );

  return (
    <Flexbox
      align="center"
      horizontal
      style={{
        gap: 8,
        left: 12,
        position: 'absolute',
        top: 12,
        zIndex: 10,
      }}
    >
      <Badge count={activeCount} size="small">
        <Button onClick={() => setOpen(true)} size="small">
          Task Center
        </Button>
      </Badge>

      {!topicId ? (
        <Typography.Text type="secondary">
          Save the conversation to enable Workbench actions.
        </Typography.Text>
      ) : null}

      <Drawer
        onClose={() => setOpen(false)}
        open={open}
        placement="top"
        title={`Task Center${conversationId ? ` (${conversationId})` : ''}`}
      >
        {isLoading ? (
          <Typography.Text type="secondary">Loading…</Typography.Text>
        ) : runs.length === 0 ? (
          <Typography.Text type="secondary">No runs for this chat yet.</Typography.Text>
        ) : (
          <Table
            columns={columns}
            dataSource={runs}
            pagination={{ pageSize: 10 }}
            rowKey={(r) => String(r.run_id)}
            size="small"
          />
        )}
      </Drawer>
    </Flexbox>
  );
});

export default WorkbenchTaskCenterOverlay;
