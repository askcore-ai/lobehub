'use client';

import type { BuiltinRender, BuiltinRenderProps } from '@lobechat/types';
import { Button, Flexbox, Tag, Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useMemo } from 'react';
import useSWR from 'swr';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import { AssignmentAuthoringApiName } from '../../types';

type WorkbenchRun = {
  failure_reason: string | null;
  run_id: number;
  state: string;
};

type AssignmentToolState = {
  actionId?: string;
  artifactId?: string;
  conversationId?: string;
  invocationId?: string;
  runId?: number;
};

const asArtifactId = (value: unknown): string | undefined => {
  const raw = String(value || '').trim();
  return /^[\dA-Fa-f-]{36}$/.test(raw) ? raw : undefined;
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  `,
  card: css`
    overflow: hidden;

    width: 100%;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  meta: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  summary: css`
    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
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
      return <Tag color={'blue'}>{state}</Tag>;
    }
    case 'running': {
      return <Tag color={'processing'}>{state}</Tag>;
    }
    case 'waiting_for_input': {
      return <Tag color={'gold'}>{state}</Tag>;
    }
    case 'succeeded': {
      return <Tag color={'green'}>{state}</Tag>;
    }
    case 'failed': {
      return <Tag color={'red'}>{state}</Tag>;
    }
    case 'cancelled': {
      return <Tag>{state}</Tag>;
    }
    default: {
      return <Tag>{state}</Tag>;
    }
  }
};

const actionTitle = (actionId: string): string => {
  if (actionId === 'assignment.draft.create_manual') return '作业草稿创建';
  if (actionId === 'assignment.draft.save') return '作业草稿保存';
  if (actionId === 'assignment.draft.publish') return '作业发布';
  return actionId || '作业编排';
};

const AssignmentAuthoringRunCardRender = memo<BuiltinRenderProps<any, any, any>>(
  ({ content, pluginState }) => {
    const state: AssignmentToolState = pluginState || {};
    const runId = Number(state.runId);
    const conversationId = String(state.conversationId || '').trim() || undefined;
    const artifactId = asArtifactId(state.artifactId);
    const canOpen = Boolean(conversationId && Number.isFinite(runId) && runId > 0);

    const { data: run } = useSWR<WorkbenchRun | undefined>(
      Number.isFinite(runId) && runId > 0 ? ['workbench:run', runId] : null,
      async ([, id]: readonly [string, number]) => fetchJson(`/api/workbench/runs/${id}`),
      {
        refreshInterval: (data) =>
          data && ['succeeded', 'failed', 'cancelled'].includes(data.state) ? 0 : 1000,
        shouldRetryOnError: false,
      },
    );

    const title = useMemo(() => actionTitle(String(state.actionId || '').trim()), [state.actionId]);

    return (
      <Flexbox className={styles.card} gap={8}>
        <Flexbox align={'center'} horizontal justify={'space-between'}>
          <div className={styles.title}>{title}</div>
          {run?.state ? stateTag(run.state) : null}
        </Flexbox>

        {content ? <div className={styles.summary}>{String(content)}</div> : null}

        <Flexbox className={styles.meta} gap={4}>
          {Number.isFinite(runId) && runId > 0 ? <Text>run {runId}</Text> : null}
          {run?.failure_reason ? <Text type={'danger'}>{run.failure_reason}</Text> : null}
        </Flexbox>

        <div className={styles.actions}>
          <Button
            disabled={!canOpen}
            onClick={() => {
              if (!canOpen) return;
              useChatStore.getState().pushPortalView({
                conversationId: conversationId!,
                runId,
                type: PortalViewType.Workbench,
                ...(artifactId ? { artifactId } : {}),
              });
            }}
            size={'small'}
            type={'primary'}
          >
            打开结果
          </Button>
        </div>
      </Flexbox>
    );
  },
);

AssignmentAuthoringRunCardRender.displayName = 'AssignmentAuthoringRunCardRender';

export const AssignmentAuthoringRenders: Record<string, BuiltinRender> = {
  [AssignmentAuthoringApiName.draftCreateManual]: AssignmentAuthoringRunCardRender as BuiltinRender,
  [AssignmentAuthoringApiName.draftSave]: AssignmentAuthoringRunCardRender as BuiltinRender,
  [AssignmentAuthoringApiName.draftPublish]: AssignmentAuthoringRunCardRender as BuiltinRender,
};
