'use client';

import type { BuiltinRender, BuiltinRenderProps } from '@lobechat/types';
import { Button, Flexbox, Tag, Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useMemo } from 'react';
import useSWR from 'swr';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import { AdminOpsApiName } from '../../types';

type WorkbenchRun = {
  failure_reason: string | null;
  run_id: number;
  state: string;
};

type AdminOpsToolState = {
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

const AdminOpsRunCardRender = memo<BuiltinRenderProps<any, any, any>>(
  ({ content, pluginState }) => {
    const state: AdminOpsToolState = pluginState || {};
    const runId = Number(state.runId);
    const conversationId = String(state.conversationId || '').trim() || undefined;
    const artifactId = asArtifactId(state.artifactId);

    const canOpen = Boolean(conversationId && Number.isFinite(runId) && runId > 0);

    const { data: run } = useSWR<WorkbenchRun | undefined>(
      Number.isFinite(runId) && runId > 0 ? ['workbench:run', runId] : null,
      async ([, runId]: readonly [string, number]) => fetchJson(`/api/workbench/runs/${runId}`),
      {
        refreshInterval: (data) =>
          data && ['succeeded', 'failed', 'cancelled'].includes(data.state) ? 0 : 1000,
        shouldRetryOnError: false,
      },
    );

    const title = useMemo(() => {
      const action = String(state.actionId || '').trim();
      if (!action) return '教务操作';
      return `教务操作：${action}`;
    }, [state.actionId]);

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

AdminOpsRunCardRender.displayName = 'AdminOpsRunCardRender';

export const AdminOpsRenders: Record<string, BuiltinRender> = {
  [AdminOpsApiName.listSchools]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listClasses]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listStudents]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listTeachers]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listAcademicYears]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listGrades]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listSubjects]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listAssignments]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listQuestions]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listSubmissions]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.listSubmissionQuestions]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createSchool]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateSchool]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteSchool]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createClass]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateClass]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteClass]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createTeacher]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateTeacher]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteTeacher]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createStudent]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateStudent]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteStudent]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createAcademicYear]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateAcademicYear]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteAcademicYear]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createGrade]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateGrade]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteGrade]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.createSubject]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateSubject]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteSubject]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.createAssignment]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateAssignment]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteAssignment]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.createQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.createSubmission]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateSubmission]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteSubmission]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.createSubmissionQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.updateSubmissionQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.deleteSubmissionQuestion]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.draftCreateManual]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.draftSave]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.draftPublish]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.importSchools]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importClasses]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importTeachers]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importStudents]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importAcademicYears]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importGrades]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.importSubjects]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.bulkDeleteStudentsPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteStudentsExecute]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteSchoolsPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteSchoolsExecute]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteAcademicYearsPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteAcademicYearsExecute]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteGradesPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteGradesExecute]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteSubjectsPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.bulkDeleteSubjectsExecute]: AdminOpsRunCardRender as BuiltinRender,

  [AdminOpsApiName.sqlPatchPreview]: AdminOpsRunCardRender as BuiltinRender,
  [AdminOpsApiName.sqlPatchExecute]: AdminOpsRunCardRender as BuiltinRender,
};
