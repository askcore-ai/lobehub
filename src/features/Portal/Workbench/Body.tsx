'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import { HelloNoteDetail, type HelloNoteContent, HelloNoteList } from './renderers/hello/HelloNote';
import { HelloTableDetail, type HelloTableContent, HelloTableList } from './renderers/hello/HelloTable';
import HelloTableEditor from './renderers/hello/HelloTableEditor';

type WorkbenchArtifact = {
  artifact_id: string;
  content: Record<string, unknown>;
  created_at: string;
  produced_by_action_id: string | null;
  produced_by_plugin_id: string | null;
  run_id: number;
  schema_version: string;
  summary: string | null;
  title: string | null;
  type: string;
};

type WorkbenchArtifactDetail = WorkbenchArtifact & {
  conversation_id: string | null;
  invocation_id: string | null;
  redaction: Record<string, unknown> | null;
  references: unknown[];
  supersedes_artifact_id: string | null;
};

type WorkbenchAction = {
  action_id: string;
  plugin_id: string;
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
};

const stateTag = (schemaVersion: string) => {
  switch (schemaVersion) {
    case 'v1': {
      return <Tag color="blue">{schemaVersion}</Tag>;
    }
    default: {
      return <Tag>{schemaVersion}</Tag>;
    }
  }
};

const WorkbenchPortalBody = memo(() => {
  const view = useChatStore(chatPortalSelectors.currentView);
  const workbenchView = view?.type === PortalViewType.Workbench ? view : null;

  const conversationId = workbenchView?.conversationId;
  const runIdFilter = workbenchView?.runId;
  const selectedArtifactId = workbenchView?.artifactId;
  const [isEditing, setIsEditing] = useState(false);

  const { data: artifacts = [], isLoading: isLoadingArtifacts } = useSWR<WorkbenchArtifact[]>(
    conversationId ? ['workbench:artifacts', conversationId, runIdFilter ?? null] : null,
    async ([, conversationId, runIdFilter]: readonly [string, string, number | null]) => {
      const params = new URLSearchParams({ conversation_id: conversationId, limit: '200' });
      if (typeof runIdFilter === 'number') params.set('run_id', String(runIdFilter));
      return fetchJson(`/api/workbench/artifacts?${params.toString()}`);
    },
    { refreshInterval: 2000 },
  );

  const { data: actions, error: actionsError } = useSWR<WorkbenchAction[]>(
    conversationId ? 'workbench:actions' : null,
    async () => fetchJson('/api/workbench/actions'),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );

  const enabledPluginIds = useMemo(() => new Set((actions || []).map((a) => a.plugin_id)), [actions]);
  const isHelloPluginEnabled =
    actionsError != null ? true : enabledPluginIds.has('aitutor-hello-plugin');

  useEffect(() => {
    if (!conversationId) return;
    if (!runIdFilter) return;
    if (selectedArtifactId) return;
    if (artifacts.length === 0) return;

    useChatStore.getState().pushPortalView({
      artifactId: artifacts[0].artifact_id,
      conversationId,
      runId: runIdFilter,
      type: PortalViewType.Workbench,
    });
  }, [artifacts, conversationId, runIdFilter, selectedArtifactId]);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedArtifactId]);

  const { data: artifactDetail } = useSWR<WorkbenchArtifactDetail | undefined>(
    selectedArtifactId ? ['workbench:artifact', selectedArtifactId] : null,
    async ([, artifactId]: readonly [string, string]) =>
      fetchJson(`/api/workbench/artifacts/${encodeURIComponent(artifactId)}`),
    { shouldRetryOnError: false },
  );

  const fallbackHint = useMemo(() => {
    if (!artifactDetail) return null;

    const isRenderedByHelloPlugin =
      isHelloPluginEnabled &&
      ((artifactDetail.type === 'hello.note' && artifactDetail.schema_version === 'v1') ||
        (artifactDetail.type === 'hello.table' && artifactDetail.schema_version === 'v1'));

    if (isRenderedByHelloPlugin) return null;

    const typeKey = `${artifactDetail.type}@${artifactDetail.schema_version}`;
    const producedByPluginId = artifactDetail.produced_by_plugin_id;

    if (actionsError) {
      return `Plugin status is unknown; showing a safe fallback view for ${typeKey}.`;
    }

    if (producedByPluginId && !enabledPluginIds.has(producedByPluginId)) {
      return `Plugin "${producedByPluginId}" is not enabled; showing a safe fallback view for ${typeKey}.`;
    }

    if (producedByPluginId) {
      return `No renderer is available for ${typeKey} (produced by "${producedByPluginId}"); showing a safe fallback view.`;
    }

    return `No renderer is available for ${typeKey}; showing a safe fallback view.`;
  }, [actionsError, artifactDetail, enabledPluginIds, isHelloPluginEnabled]);

  const columns = useMemo<ColumnsType<WorkbenchArtifact>>(
    () => [
      { dataIndex: 'artifact_id', key: 'artifact_id', title: 'Artifact' },
      { dataIndex: 'type', key: 'type', title: 'Type' },
      { dataIndex: 'title', key: 'title', title: 'Title' },
      {
        key: 'preview',
        render: (_, record) => {
          if (!isHelloPluginEnabled) return <Typography.Text type="secondary">{record.summary || '—'}</Typography.Text>;

          if (record.type === 'hello.note' && record.schema_version === 'v1') {
            return <HelloNoteList content={record.content as HelloNoteContent} />;
          }

          if (record.type === 'hello.table' && record.schema_version === 'v1') {
            return <HelloTableList content={record.content as HelloTableContent} />;
          }

          return <Typography.Text type="secondary">{record.summary || '—'}</Typography.Text>;
        },
        title: 'Preview',
      },
      {
        dataIndex: 'schema_version',
        key: 'schema_version',
        render: (value: string) => stateTag(value),
        title: 'Schema',
      },
      { dataIndex: 'created_at', key: 'created_at', title: 'Created' },
      { dataIndex: 'run_id', key: 'run_id', title: 'Run' },
      {
        key: 'actions',
        render: (_, record) => (
          <Space>
            <Button
              onClick={() => {
                if (!conversationId) return;
                useChatStore.getState().pushPortalView({
                  artifactId: record.artifact_id,
                  conversationId,
                  runId: runIdFilter,
                  type: PortalViewType.Workbench,
                });
              }}
              size="small"
            >
              Open
            </Button>
          </Space>
        ),
        title: 'Actions',
      },
    ],
    [conversationId, isHelloPluginEnabled, runIdFilter],
  );

  if (!conversationId) {
    return (
      <Flexbox flex={1} paddingInline={12} style={{ overflow: 'auto' }}>
        <Empty description="Save the conversation first to use Workbench artifacts." />
      </Flexbox>
    );
  }

  if (isLoadingArtifacts) return <Loading debugId={'WorkbenchPortal'} />;

  return (
    <Flexbox flex={1} gap={12} paddingInline={12} style={{ overflow: 'auto' }}>
      <Flexbox gap={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Artifacts
        </Typography.Title>

        <Space wrap>
          <Tag>{conversationId}</Tag>
          {runIdFilter ? <Tag color="purple">run {runIdFilter}</Tag> : null}
          {runIdFilter ? (
            <Button
              onClick={() => {
                useChatStore.getState().pushPortalView({
                  conversationId,
                  type: PortalViewType.Workbench,
                });
              }}
              size="small"
            >
              Show all runs
            </Button>
          ) : null}
          {selectedArtifactId ? (
            <Button
              onClick={() => {
                useChatStore.getState().pushPortalView({
                  conversationId,
                  runId: runIdFilter,
                  type: PortalViewType.Workbench,
                });
              }}
              size="small"
            >
              Close detail
            </Button>
          ) : null}
        </Space>
      </Flexbox>

      {artifacts.length === 0 ? (
        <Empty description="No artifacts for this chat yet." />
      ) : (
        <Table
          columns={columns}
          dataSource={artifacts}
          pagination={{ pageSize: 20 }}
          rowKey={(a) => a.artifact_id}
          size="small"
        />
      )}

      {selectedArtifactId ? (
        <Flexbox gap={8}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Artifact detail
          </Typography.Title>

          {fallbackHint ? <Typography.Text type="secondary">{fallbackHint}</Typography.Text> : null}

          <Flexbox
            style={{
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 8,
              maxHeight: 480,
              overflow: 'auto',
              padding: 12,
            }}
          >
            {artifactDetail ? (
              artifactDetail.type === 'hello.note' &&
              artifactDetail.schema_version === 'v1' &&
              isHelloPluginEnabled ? (
                <HelloNoteDetail content={artifactDetail.content as HelloNoteContent} />
              ) : artifactDetail.type === 'hello.table' &&
                artifactDetail.schema_version === 'v1' &&
                isHelloPluginEnabled ? (
                <Flexbox gap={12}>
                  <HelloTableDetail content={artifactDetail.content as HelloTableContent} />
                  <Space>
                    <Button onClick={() => setIsEditing((v) => !v)} size="small">
                      {isEditing ? 'Close editor' : 'Edit'}
                    </Button>
                  </Space>
                  {isEditing ? (
                    <HelloTableEditor
                      artifactId={artifactDetail.artifact_id}
                      conversationId={conversationId}
                      initialContent={artifactDetail.content}
                      onClose={() => setIsEditing(false)}
                    />
                  ) : null}
                </Flexbox>
              ) : (
                <pre style={{ margin: 0 }}>{JSON.stringify(artifactDetail, null, 2)}</pre>
              )
            ) : (
              <Typography.Text type="secondary">Loading…</Typography.Text>
            )}
          </Flexbox>
        </Flexbox>
      ) : null}
    </Flexbox>
  );
});

export default WorkbenchPortalBody;
