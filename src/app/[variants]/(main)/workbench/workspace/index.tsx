'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Button, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import NavHeader from '@/features/NavHeader';

type WorkbenchRun = {
  run_id: number;
  state: string;
  workflow_name: string;
};

type WorkbenchArtifact = {
  artifact_id: string;
  content: Record<string, unknown>;
  created_at: string;
  run_id: number;
  tenant_id: number;
  title: string | null;
  type: string;
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
};

const Workspace = memo(() => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedRunId, setSelectedRunId] = useState<number | null>(() => {
    const raw = searchParams.get('runId');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  const { data: runs = [], isLoading: isLoadingRuns } = useSWR<WorkbenchRun[]>(
    'workbench:runs',
    () => fetchJson('/api/workbench/runs'),
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    if (selectedRunId !== null) return;
    if (runs.length === 0) return;

    const first = runs[0];
    setSelectedRunId(first.run_id);
    setSearchParams({ runId: String(first.run_id) });
  }, [runs, selectedRunId, setSearchParams]);

  const { data: artifacts = [], isLoading: isLoadingArtifacts } = useSWR<WorkbenchArtifact[]>(
    selectedRunId ? `workbench:artifacts:${selectedRunId}` : null,
    () => fetchJson(`/api/workbench/runs/${selectedRunId}/artifacts`),
    { refreshInterval: 2000 },
  );

  const { data: artifactDetail } = useSWR<WorkbenchArtifact | undefined>(
    selectedArtifactId ? `workbench:artifact:${selectedArtifactId}` : null,
    () => fetchJson(`/api/workbench/artifacts/${selectedArtifactId}`),
    { shouldRetryOnError: false },
  );

  const columns = useMemo<ColumnsType<WorkbenchArtifact>>(
    () => [
      { dataIndex: 'artifact_id', key: 'artifact_id', title: 'Artifact' },
      { dataIndex: 'type', key: 'type', title: 'Type' },
      { dataIndex: 'title', key: 'title', title: 'Title' },
      { dataIndex: 'created_at', key: 'created_at', title: 'Created' },
      {
        key: 'actions',
        render: (_, record) => (
          <Space>
            <Button onClick={() => setSelectedArtifactId(record.artifact_id)} size="small">
              Open
            </Button>
          </Space>
        ),
        title: 'Actions',
      },
    ],
    [],
  );

  const isLoading = isLoadingRuns || (selectedRunId ? isLoadingArtifacts : false);
  if (isLoading) return <Loading debugId={'WorkbenchWorkspace'} />;

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader />

      <Flexbox gap={16} padding={16} style={{ overflow: 'auto' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Workspace
        </Typography.Title>

        <Space wrap>
          <Select
            onChange={(value) => {
              setSelectedArtifactId(null);
              setSelectedRunId(value);
              setSearchParams({ runId: String(value) });
            }}
            options={runs.map((r) => ({
              label: `Run ${r.run_id} (${r.state})`,
              value: r.run_id,
            }))}
            placeholder="Select a run"
            style={{ minWidth: 260 }}
            value={selectedRunId ?? undefined}
          />
        </Space>

        {!selectedRunId ? (
          <Typography.Text type="secondary">No runs yet.</Typography.Text>
        ) : artifacts.length === 0 ? (
          <Typography.Text type="secondary">No artifacts for this run yet.</Typography.Text>
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
              Artifact {selectedArtifactId}
            </Typography.Title>
            <Flexbox
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
                maxHeight: 480,
                overflow: 'auto',
                padding: 12,
              }}
            >
              <pre style={{ margin: 0 }}>
                {artifactDetail ? JSON.stringify(artifactDetail.content, null, 2) : 'Loading...'}
              </pre>
            </Flexbox>
            <Button
              onClick={() => {
                setSelectedArtifactId(null);
                message.info('Closed');
              }}
            >
              Close
            </Button>
          </Flexbox>
        ) : null}
      </Flexbox>
    </Flexbox>
  );
});

export default Workspace;
