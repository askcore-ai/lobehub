'use client';

import { Flexbox } from '@lobehub/ui';
import {
  Alert,
  App,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Component, type ReactNode, memo, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import SchoolsRenderer from './renderers/admin_ops/Schools';
import {
  type AssignmentDraftContent,
  AssignmentDraftDetail,
  AssignmentDraftList,
} from './renderers/assignment_authoring/AssignmentDraft';
import AssignmentDraftEditor from './renderers/assignment_authoring/AssignmentDraftEditor';
import AssignmentOcrStart from './renderers/assignment_authoring/AssignmentOcrStart';
import {
  type AssignmentPublishResultContent,
  AssignmentPublishResultDetail,
  AssignmentPublishResultList,
} from './renderers/assignment_authoring/AssignmentPublishResult';
import { type HelloNoteContent, HelloNoteDetail, HelloNoteList } from './renderers/hello/HelloNote';
import {
  type HelloTableContent,
  HelloTableDetail,
  HelloTableList,
} from './renderers/hello/HelloTable';
import HelloTableEditor from './renderers/hello/HelloTableEditor';

type WorkbenchRun = {
  conversation_id: string | null;
  created_at: string;
  failure_reason: string | null;
  finished_at: string | null;
  input: Record<string, unknown>;
  invocation_id: string | null;
  original_run_id: number | null;
  run_id: number;
  started_at: string | null;
  state: string;
  temporal_run_id: string | null;
  temporal_workflow_id: string | null;
  tenant_id: number;
  tracing_degraded: boolean;
  user_id: string;
  workflow_name: string;
};

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

type WorkbenchTraceLink = { trace_link: string };
type WorkbenchTemporalLink = { temporal_link: string | null };

type WorkbenchStreamEvent = {
  payload: Record<string, unknown>;
  seq: number;
  state: string;
  type: string;
};

type FetchInit = Parameters<typeof fetch>[1];

const fetchJson = async <T,>(url: string, init?: FetchInit): Promise<T> => {
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

const runStateTag = (state: string) => {
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

type ErrorBoundaryState = { error: Error | null };

class WorkbenchPortalErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('[workbench] portal crashed', error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Flexbox flex={1} gap={8} paddingInline={12} style={{ overflow: 'auto' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Workbench 面板暂时不可用
        </Typography.Title>
        <Typography.Text type="secondary">
          这通常是临时网络/数据问题导致的渲染异常。你可以点击“重试”重新渲染。
        </Typography.Text>
        <Flexbox
          style={{
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            maxHeight: 260,
            overflow: 'auto',
            padding: 12,
          }}
        >
          <pre style={{ margin: 0 }}>{String(this.state.error.message || this.state.error)}</pre>
        </Flexbox>
        <Space>
          <Button onClick={this.reset} size="small" type="primary">
            重试
          </Button>
        </Space>
      </Flexbox>
    );
  }
}

const WorkbenchPortalBodyInner = memo(() => {
  const { message } = App.useApp();
  const view = useChatStore(chatPortalSelectors.currentView);
  const workbenchView = view?.type === PortalViewType.Workbench ? view : null;

  const conversationId = workbenchView?.conversationId;
  const runId = workbenchView?.runId;
  const selectedArtifactId = workbenchView?.artifactId;
  const backToRunId = workbenchView?.backToRunId;
  const backToArtifactId = workbenchView?.backToArtifactId;
  const hasRunId = typeof runId === 'number' && Number.isFinite(runId) && runId > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [events, setEvents] = useState<WorkbenchStreamEvent[]>([]);

  const {
    data: run,
    isLoading: isLoadingRun,
    mutate: mutateRun,
  } = useSWR<WorkbenchRun | undefined>(
    hasRunId ? ['workbench:run', runId] : null,
    async ([, runId]: readonly [string, number]) => fetchJson(`/api/workbench/runs/${runId}`),
    {
      refreshInterval: (data) =>
        data && ['succeeded', 'failed', 'cancelled'].includes(data.state) ? 0 : 1000,
    },
  );

  const { data: traceLink } = useSWR<WorkbenchTraceLink | undefined>(
    hasRunId ? ['workbench:trace', runId] : null,
    async ([, runId]: readonly [string, number]) => {
      try {
        return await fetchJson(`/api/workbench/runs/${runId}/trace`);
      } catch {
        return undefined;
      }
    },
    { shouldRetryOnError: false },
  );

  const { data: temporalLink } = useSWR<WorkbenchTemporalLink | undefined>(
    hasRunId ? ['workbench:temporal-link', runId] : null,
    async ([, runId]: readonly [string, number]) => {
      try {
        return await fetchJson(`/api/workbench/runs/${runId}/temporal-link`);
      } catch {
        return undefined;
      }
    },
    { shouldRetryOnError: false },
  );

  const { data: artifacts = [], isLoading: isLoadingArtifacts } = useSWR<WorkbenchArtifact[]>(
    conversationId
      ? hasRunId
        ? ['workbench:run-artifacts', runId]
        : ['workbench:artifacts', conversationId]
      : null,
    async ([key, arg]: readonly [string, string | number]) => {
      if (key === 'workbench:run-artifacts') {
        return fetchJson(`/api/workbench/runs/${arg}/artifacts`);
      }
      const params = new URLSearchParams({ conversation_id: String(arg), limit: '200' });
      return fetchJson(`/api/workbench/artifacts?${params.toString()}`);
    },
    { refreshInterval: 2000 },
  );

  const { data: actions, error: actionsError } = useSWR<WorkbenchAction[]>(
    conversationId ? 'workbench:actions' : null,
    async () => fetchJson('/api/workbench/actions'),
    { refreshInterval: 15_000, shouldRetryOnError: false },
  );

  const enabledPluginIds = useMemo(
    () => new Set((actions || []).map((a) => a.plugin_id)),
    [actions],
  );
  const isHelloPluginEnabled = actionsError ? true : enabledPluginIds.has('aitutor-hello-plugin');
  const isAssignmentAuthoringEnabled = actionsError ? true : enabledPluginIds.has('admin.ops.v1');

  const handleCancel = useCallback(
    async (targetRunId: number) => {
      Modal.confirm({
        content: `Cancel run ${targetRunId}?`,
        onOk: async () => {
          await fetchJson(`/api/workbench/runs/${targetRunId}/cancel`, { method: 'POST' });
          await mutateRun();
          message.success('Cancelled');
        },
        title: 'Confirm cancel',
      });
    },
    [message, mutateRun],
  );

  const handleRetry = useCallback(
    async (targetRunId: number) => {
      if (!conversationId) {
        message.error('Save the conversation first to retry runs.');
        return;
      }

      Modal.confirm({
        content: `Retry run ${targetRunId}? This creates a new run.`,
        onOk: async () => {
          const out = await fetchJson<{ run_id: number }>(
            `/api/workbench/runs/${targetRunId}/retry`,
            { method: 'POST' },
          );
          useChatStore.getState().pushPortalView({
            conversationId,
            runId: out.run_id,
            type: PortalViewType.Workbench,
          });
          message.success('Retry started');
        },
        title: 'Confirm retry',
      });
    },
    [conversationId, message],
  );

  useEffect(() => {
    if (!conversationId) return;
    if (!hasRunId) return;
    if (selectedArtifactId) return;
    if (artifacts.length === 0) return;

    // CSV import results can be large. Avoid auto-opening the raw JSON fallback view.
    const top = artifacts[0];
    if (top.type === 'admin.import.result' && top.schema_version === 'v1') return;

    useChatStore.getState().pushPortalView({
      artifactId: artifacts[0].artifact_id,
      conversationId,
      runId,
      type: PortalViewType.Workbench,
    });
  }, [artifacts, conversationId, hasRunId, runId, selectedArtifactId]);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedArtifactId]);

  useEffect(() => {
    if (!hasRunId) return;
    setEvents([]);
    setShowDetails(false);

    let es: EventSource | null = null;
    try {
      es = new EventSource(
        `/api/workbench/runs/${encodeURIComponent(String(runId))}/events/stream`,
      );
    } catch {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as WorkbenchStreamEvent;
        setEvents((prev) => [...prev, payload].slice(-500));
      } catch {
        // ignore malformed events
      }
    };

    const onError = () => {
      es?.close();
    };

    es.addEventListener('message', onMessage);
    es.addEventListener('error', onError);

    return () => {
      es?.removeEventListener('message', onMessage);
      es?.removeEventListener('error', onError);
      es?.close();
    };
  }, [hasRunId, runId]);

  const { data: artifactDetail } = useSWR<WorkbenchArtifactDetail | undefined>(
    selectedArtifactId ? ['workbench:artifact', selectedArtifactId] : null,
    async ([, artifactId]: readonly [string, string]) =>
      fetchJson(`/api/workbench/artifacts/${encodeURIComponent(artifactId)}`),
    { shouldRetryOnError: false },
  );

  const hasKnownRenderer = useMemo(() => {
    if (!artifactDetail) return false;

    const isHelloNote =
      artifactDetail.type === 'hello.note' &&
      artifactDetail.schema_version === 'v1' &&
      isHelloPluginEnabled;
    if (isHelloNote) return true;

    const isHelloTable =
      artifactDetail.type === 'hello.table' &&
      artifactDetail.schema_version === 'v1' &&
      isHelloPluginEnabled;
    if (isHelloTable) return true;

    const isAssignmentDraft =
      artifactDetail.type === 'assignment.draft' &&
      artifactDetail.schema_version === 'v1' &&
      isAssignmentAuthoringEnabled;
    if (isAssignmentDraft) return true;

    const isAssignmentPublishResult =
      artifactDetail.type === 'assignment.publish.result' &&
      artifactDetail.schema_version === 'v1' &&
      isAssignmentAuthoringEnabled;
    if (isAssignmentPublishResult) return true;

    const adminEntityType = String((artifactDetail.content as any)?.entity_type || '').trim();
    const isAdminEntityList =
      artifactDetail.type === 'admin.entity.list' &&
      artifactDetail.schema_version === 'v1' &&
      artifactDetail.produced_by_plugin_id === 'admin.ops.v1' &&
      [
        'school',
        'teacher',
        'class',
        'student',
        'academic_year',
        'grade',
        'subject',
        'assignment',
        'question',
        'submission',
        'submission_question',
      ].includes(adminEntityType);
    if (isAdminEntityList) return true;

    return false;
  }, [artifactDetail, isAssignmentAuthoringEnabled, isHelloPluginEnabled]);

  const fallbackHint = useMemo(() => {
    if (!artifactDetail) return null;
    if (hasKnownRenderer) return null;

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
  }, [actionsError, artifactDetail, enabledPluginIds, hasKnownRenderer, isHelloPluginEnabled]);

  const artifactColumns = useMemo<ColumnsType<WorkbenchArtifact>>(
    () => [
      { dataIndex: 'artifact_id', key: 'artifact_id', title: 'Artifact' },
      { dataIndex: 'type', key: 'type', title: 'Type' },
      { dataIndex: 'title', key: 'title', title: 'Title' },
      {
        key: 'preview',
        render: (_, record) => {
          if (
            record.type === 'assignment.draft' &&
            record.schema_version === 'v1' &&
            isAssignmentAuthoringEnabled
          ) {
            return <AssignmentDraftList content={record.content as AssignmentDraftContent} />;
          }

          if (
            record.type === 'assignment.publish.result' &&
            record.schema_version === 'v1' &&
            isAssignmentAuthoringEnabled
          ) {
            return (
              <AssignmentPublishResultList
                content={record.content as AssignmentPublishResultContent}
              />
            );
          }

          if (isHelloPluginEnabled) {
            if (record.type === 'hello.note' && record.schema_version === 'v1') {
              return <HelloNoteList content={record.content as HelloNoteContent} />;
            }

            if (record.type === 'hello.table' && record.schema_version === 'v1') {
              return <HelloTableList content={record.content as HelloTableContent} />;
            }
          }

          return <Typography.Text type="secondary">{record.summary || '—'}</Typography.Text>;
        },
        title: 'Preview',
      },
      {
        dataIndex: 'schema_version',
        key: 'schema_version',
        render: (value: string) => <Tag>{value}</Tag>,
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
                  runId: record.run_id,
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
    [conversationId, isAssignmentAuthoringEnabled, isHelloPluginEnabled, runId],
  );

  if (!conversationId) {
    return (
      <Flexbox flex={1} paddingInline={12} style={{ overflow: 'auto' }}>
        <Empty description="Save the conversation first to use Workbench artifacts." />
      </Flexbox>
    );
  }

  const isLoading = isLoadingArtifacts || (hasRunId ? isLoadingRun : false);
  if (isLoading) return <Loading debugId={'WorkbenchPortal'} />;

  const canCancel = run ? !['succeeded', 'failed', 'cancelled'].includes(run.state) : false;

  return (
    <Flexbox flex={1} gap={12} paddingInline={12} style={{ overflow: 'auto' }}>
      <Flexbox gap={8}>
        <Flexbox align={'center'} horizontal justify={'space-between'}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Workbench
          </Typography.Title>

          {run ? (
            <Space>
              <Button
                danger
                disabled={!canCancel}
                onClick={() => handleCancel(run.run_id)}
                size="small"
              >
                Cancel
              </Button>
              <Button onClick={() => handleRetry(run.run_id)} size="small">
                Retry
              </Button>
              <Button onClick={() => setShowDetails((v) => !v)} size="small">
                {showDetails ? 'Hide details' : 'Show details'}
              </Button>
              {traceLink?.trace_link ? (
                <Button
                  href={traceLink.trace_link}
                  rel="noreferrer"
                  size="small"
                  target="_blank"
                  type="link"
                >
                  Trace
                </Button>
              ) : null}
              {temporalLink?.temporal_link ? (
                <Button
                  href={temporalLink.temporal_link}
                  rel="noreferrer"
                  size="small"
                  target="_blank"
                  type="link"
                >
                  Temporal
                </Button>
              ) : null}
            </Space>
          ) : null}
        </Flexbox>

        <Space wrap>
          <Tag>{conversationId}</Tag>
          {hasRunId ? <Tag color="purple">run {runId}</Tag> : null}
          {run?.state ? runStateTag(run.state) : null}
          {run?.tracing_degraded ? <Tag color="warning">tracing degraded</Tag> : null}
          {!hasRunId && backToRunId ? (
            <Button
              onClick={() =>
                useChatStore.getState().pushPortalView({
                  artifactId: backToArtifactId,
                  conversationId,
                  runId: backToRunId,
                  type: PortalViewType.Workbench,
                })
              }
              size="small"
            >
              Back
            </Button>
          ) : null}
          {hasRunId ? (
            <Button
              onClick={() =>
                useChatStore.getState().pushPortalView({
                  backToArtifactId: selectedArtifactId,
                  backToRunId: runId,
                  conversationId,
                  type: PortalViewType.Workbench,
                })
              }
              size="small"
            >
              Show all artifacts
            </Button>
          ) : null}
        </Space>

        {run?.state === 'failed' ? (
          <Alert
            description={
              <Flexbox gap={6}>
                <Typography.Text type="secondary">执行失败原因</Typography.Text>
                <Flexbox
                  style={{
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 8,
                    maxHeight: 140,
                    overflow: 'auto',
                    padding: 10,
                  }}
                >
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {run.failure_reason || 'unknown_error'}
                  </pre>
                </Flexbox>
              </Flexbox>
            }
            message="Run Failed"
            showIcon
            type="error"
          />
        ) : null}

        {hasRunId ? (
          <Space wrap>
            <Select
              allowClear
              onChange={(value) => {
                if (!value) {
                  useChatStore.getState().pushPortalView({
                    conversationId,
                    runId,
                    type: PortalViewType.Workbench,
                  });
                  return;
                }
                useChatStore.getState().pushPortalView({
                  artifactId: String(value),
                  conversationId,
                  runId,
                  type: PortalViewType.Workbench,
                });
              }}
              options={artifacts.map((a) => ({
                label: `${a.type}@${a.schema_version}${a.title ? ` · ${a.title}` : ''}`,
                value: a.artifact_id,
              }))}
              placeholder="Select an artifact"
              size="small"
              style={{ minWidth: 320 }}
              value={selectedArtifactId ?? undefined}
            />
            {selectedArtifactId ? (
              <Button
                onClick={() =>
                  useChatStore.getState().pushPortalView({
                    conversationId,
                    runId,
                    type: PortalViewType.Workbench,
                  })
                }
                size="small"
              >
                Close
              </Button>
            ) : null}
          </Space>
        ) : null}
      </Flexbox>

      {hasRunId && showDetails && run ? (
        <Collapse
          activeKey={['meta', 'events']}
          items={[
            {
              children: (
                <Descriptions bordered column={1} size="small" title={`Run ${run.run_id}`}>
                  <Descriptions.Item label="Workflow">{run.workflow_name}</Descriptions.Item>
                  <Descriptions.Item label="State">{runStateTag(run.state)}</Descriptions.Item>
                  <Descriptions.Item label="Tenant">{run.tenant_id}</Descriptions.Item>
                  <Descriptions.Item label="User">{run.user_id}</Descriptions.Item>
                  <Descriptions.Item label="Conversation">
                    {run.conversation_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Invocation">
                    {run.invocation_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Temporal Workflow">
                    {run.temporal_workflow_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Temporal Run">
                    {run.temporal_run_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Created">{run.created_at}</Descriptions.Item>
                  <Descriptions.Item label="Started">{run.started_at || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Finished">{run.finished_at || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Original Run">
                    {run.original_run_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Failure">{run.failure_reason || '-'}</Descriptions.Item>
                </Descriptions>
              ),
              key: 'meta',
              label: 'Meta',
            },
            {
              children: (
                <Flexbox
                  gap={6}
                  style={{
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    maxHeight: 240,
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
              ),
              key: 'events',
              label: 'Events',
            },
          ]}
        />
      ) : null}

      {hasRunId ? (
        artifacts.length === 0 ? (
          <Empty description="No artifacts for this run yet." />
        ) : selectedArtifactId ? (
          <Flexbox gap={8}>
            {fallbackHint ? (
              <Typography.Text type="secondary">{fallbackHint}</Typography.Text>
            ) : null}

            <Flexbox
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
                maxHeight: 560,
                overflow: 'auto',
                padding: 12,
              }}
            >
              {artifactDetail ? (
                artifactDetail.type === 'hello.note' &&
                artifactDetail.schema_version === 'v1' &&
                isHelloPluginEnabled ? (
                  <HelloNoteDetail content={artifactDetail.content as HelloNoteContent} />
                ) : artifactDetail.type === 'assignment.draft' &&
                  artifactDetail.schema_version === 'v1' &&
                  isAssignmentAuthoringEnabled ? (
                  <Flexbox gap={12}>
                    <AssignmentDraftDetail
                      content={artifactDetail.content as AssignmentDraftContent}
                    />
                    <Space>
                      <Button onClick={() => setIsEditing((v) => !v)} size="small">
                        {isEditing ? 'Close editor' : 'Edit'}
                      </Button>
                    </Space>
                    {isEditing ? (
                      <AssignmentDraftEditor
                        artifactId={artifactDetail.artifact_id}
                        conversationId={conversationId}
                        initialContent={artifactDetail.content}
                        onClose={() => setIsEditing(false)}
                      />
                    ) : null}
                  </Flexbox>
                ) : artifactDetail.type === 'admin.entity.list' &&
                  artifactDetail.schema_version === 'v1' &&
                  artifactDetail.produced_by_plugin_id === 'admin.ops.v1' &&
                  [
                    'school',
                    'teacher',
                    'class',
                    'student',
                    'academic_year',
                    'grade',
                    'subject',
                    'assignment',
                    'question',
                    'submission',
                    'submission_question',
                  ].includes(String((artifactDetail.content as any)?.entity_type || '').trim()) ? (
                  <SchoolsRenderer
                    artifactId={artifactDetail.artifact_id}
                    content={artifactDetail.content as any}
                    conversationId={conversationId}
                  />
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
                ) : artifactDetail.type === 'assignment.publish.result' &&
                  artifactDetail.schema_version === 'v1' &&
                  isAssignmentAuthoringEnabled ? (
                  <AssignmentPublishResultDetail
                    content={artifactDetail.content as AssignmentPublishResultContent}
                  />
                ) : (
                  <pre style={{ margin: 0 }}>{JSON.stringify(artifactDetail, null, 2)}</pre>
                )
              ) : (
                <Typography.Text type="secondary">Loading…</Typography.Text>
              )}
            </Flexbox>
          </Flexbox>
        ) : (
          <Empty description="Select an artifact to view details." />
        )
      ) : (
        <Flexbox gap={12}>
          {conversationId && isAssignmentAuthoringEnabled ? (
            <AssignmentOcrStart conversationId={conversationId} />
          ) : null}

          {artifacts.length === 0 ? (
            <Empty description="No artifacts for this chat yet. Run a tool call to produce artifacts." />
          ) : (
            <Table
              columns={artifactColumns}
              dataSource={artifacts}
              pagination={{ pageSize: 20 }}
              rowKey={(a) => a.artifact_id}
              size="small"
            />
          )}
        </Flexbox>
      )}
    </Flexbox>
  );
});

const WorkbenchPortalBody = memo(() => {
  return (
    <WorkbenchPortalErrorBoundary>
      <WorkbenchPortalBodyInner />
    </WorkbenchPortalErrorBoundary>
  );
});

export default WorkbenchPortalBody;
