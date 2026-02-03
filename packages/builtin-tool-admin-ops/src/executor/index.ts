import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { AdminOpsIdentifier } from '../manifest';
import { AdminOpsApiName } from '../types';

type StartInvocationResponse = { invocation_id: string; run_id: number };
type PresignUploadResponse = {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
};

type _WorkbenchRun = {
  failure_reason?: string | null;
  run_id: number;
  state: string;
};

type _WorkbenchArtifact = {
  artifact_id: string;
  content: any;
  schema_version: string;
  summary?: string | null;
  title?: string | null;
  type: string;
};

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const _conversationId = (ctx: BuiltinToolContext): string | null => {
  if (!ctx.topicId) return null;
  return ctx.threadId ? `lc_thread:${ctx.threadId}` : `lc_topic:${ctx.topicId}`;
};

const _sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const sha256Hex = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const tenantIdFromObjectKey = (objectKey: string): number | null => {
  const match = /^uploads\/tenant-(\d+)\//.exec(objectKey);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

class AdminOpsExecutor extends BaseExecutor<typeof AdminOpsApiName> {
  readonly identifier = AdminOpsIdentifier;

  protected readonly apiEnum = AdminOpsApiName;

  private async _fetchJson<T>(
    input: FetchInput,
    init?: FetchInit,
  ): Promise<{ data: T; ok: true } | { error: string; ok: false }> {
    const res = await fetch(input, init);
    if (!res.ok) {
      const text = await res.text();
      return { error: text || String(res.status), ok: false };
    }
    return { data: (await res.json()) as T, ok: true };
  }

  private async _waitForRunCompletion(
    runId: number,
    options: { timeoutMs: number },
  ): Promise<
    | { ok: true; run: _WorkbenchRun }
    | { error: string; ok: false; timedOut: true }
    | { error: string; ok: false; timedOut: false }
  > {
    const startMs = Date.now();
    const terminalStates = new Set(['succeeded', 'failed', 'cancelled']);
    let pollMs = 200;

    for (;;) {
      const runRes = await this._fetchJson<_WorkbenchRun>(
        `/api/workbench/runs/${encodeURIComponent(String(runId))}`,
      );
      if (!runRes.ok)
        return { error: `Failed to get run: ${runRes.error}`, ok: false, timedOut: false };
      const run = runRes.data;
      if (terminalStates.has(String(run.state))) return { ok: true, run };

      if (Date.now() - startMs > options.timeoutMs) {
        return { error: `Timed out after ${options.timeoutMs}ms`, ok: false, timedOut: true };
      }

      await _sleep(pollMs);
      pollMs = Math.min(1000, Math.floor(pollMs * 1.3));
    }
  }

  private _entityLabel(entityType: string): string {
    const key = String(entityType || '').trim();
    if (key === 'school') return '学校';
    if (key === 'class') return '班级';
    if (key === 'teacher') return '教师';
    if (key === 'student') return '学生';
    if (key === 'academic_year') return '学年';
    if (key === 'grade') return '年级';
    if (key === 'subject') return '学科';
    return key || '实体';
  }

  private _listActionId(entityType: string): string {
    const key = String(entityType || '').trim();
    if (key === 'school') return 'admin.list.schools';
    if (key === 'class') return 'admin.list.classes';
    if (key === 'teacher') return 'admin.list.teachers';
    if (key === 'student') return 'admin.list.students';
    if (key === 'academic_year') return 'admin.list.academic_years';
    if (key === 'grade') return 'admin.list.grades';
    if (key === 'subject') return 'admin.list.subjects';
    return 'admin.list.schools';
  }

  private async _openCsvImportUi(
    entityType: 'school' | 'class' | 'teacher' | 'student' | 'academic_year' | 'grade' | 'subject',
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> {
    const listActionId = this._listActionId(entityType);
    const listResult = await this.startInvocation(
      listActionId,
      { filters: {}, page: 1, page_size: 50 },
      ctx,
      { executionMode: 'blocking', requireConfirmation: false },
    );

    const entityLabel = this._entityLabel(entityType);
    const hint = `请点击运行卡片打开右侧面板，在${entityLabel}列表页点击 “Import CSV” 上传并导入。`;
    const prev = String(listResult.content || '').trim();

    return {
      ...listResult,
      content: prev ? `${prev}\n\n${hint}` : hint,
    };
  }

  private _summarizeArtifact(actionId: string, artifact: _WorkbenchArtifact): string {
    const typeKey = `${artifact.type}@${artifact.schema_version}`;

    if (typeKey === 'admin.mutation.result@v1') {
      const entityType = String(artifact.content?.entity_type || '');
      const operation = String(artifact.content?.operation || '');
      const entityId = artifact.content?.entity_id;
      const status = String(artifact.content?.status || '');
      const errorCode = String(artifact.content?.error_code || '');
      const message = String(artifact.content?.message || '');

      const opLabel =
        operation === 'create'
          ? '创建'
          : operation === 'update'
            ? '更新'
            : operation === 'delete'
              ? '删除'
              : operation;
      const entityLabel = this._entityLabel(entityType);

      if (status === 'succeeded') return `${opLabel}${entityLabel}成功（ID=${entityId}）`;

      const details = [errorCode, message].filter(Boolean).join('：');
      return `${opLabel}${entityLabel}失败${details ? `（${details}）` : ''}`;
    }

    if (typeKey === 'admin.entity.resolve@v1') {
      const entityType = String(artifact.content?.entity_type || '');
      const entityLabel = this._entityLabel(entityType);
      const status = String(artifact.content?.status || '');
      const explanation = String(artifact.content?.explanation || '').trim();
      const candidates = Array.isArray(artifact.content?.candidates)
        ? artifact.content.candidates
        : [];
      const preview = candidates
        .slice(0, 8)
        .map((c: any) => `${c?.entity_id ?? '?'}:${String(c?.display_name ?? '').slice(0, 50)}`)
        .filter(Boolean)
        .join(', ');

      if (status === 'resolved') {
        return `已解析${entityLabel}：候选 ${candidates.length} 个。${preview ? `候选（前${Math.min(8, candidates.length)}个）：${preview}` : ''}`;
      }
      if (status === 'ambiguous') {
        return (
          `已解析${entityLabel}：存在多个候选，需要人工确认。` +
          `${preview ? `候选（前${Math.min(8, candidates.length)}个）：${preview}` : ''}` +
          `${explanation ? `。提示：${explanation}` : ''}`
        );
      }
      return `未能解析${entityLabel}（no_match）${explanation ? `：${explanation}` : ''}`;
    }

    if (typeKey === 'admin.entity.list@v1') {
      const entityType = String(artifact.content?.entity_type || '');
      const entityLabel = this._entityLabel(entityType);
      const totalRaw = artifact.content?.total;
      const total = typeof totalRaw === 'number' ? totalRaw : null;
      const page = Number(artifact.content?.page);
      const pageSize = Number(artifact.content?.page_size);
      const hasMore = Boolean(artifact.content?.has_more);
      const nextAfterIdRaw = artifact.content?.next_after_id;
      const nextAfterId = typeof nextAfterIdRaw === 'number' ? nextAfterIdRaw : null;
      const ids = Array.isArray(artifact.content?.ids) ? artifact.content.ids : [];
      const previewIds = ids.slice(0, 20).join(', ');
      const totalLabel = total !== null ? `总数 ${total}` : '';
      const pageLabel = Number.isFinite(page) ? `第 ${page} 页` : '';
      const pageSizeLabel = Number.isFinite(pageSize) ? `每页 ${pageSize}` : '';
      const idsLabel = ids.length
        ? `本页 ID（前${Math.min(20, ids.length)}个）：${previewIds}${ids.length > 20 ? '…' : ''}`
        : '本页无数据';
      const pagingHint = hasMore
        ? nextAfterId !== null
          ? `还有更多，可继续查询（after_id=${nextAfterId}）`
          : '还有更多，可继续查询'
        : '';
      const metaLabel = [totalLabel, pageSizeLabel, pageLabel].filter(Boolean).join('，');
      return `已查询${entityLabel}列表：${metaLabel}${pagingHint ? `，${pagingHint}` : ''}。${idsLabel}`;
    }

    if (typeKey === 'admin.bulk_delete.preview@v1') {
      const existingIds = Array.isArray(artifact.content?.existing_ids)
        ? artifact.content.existing_ids
        : [];
      const missingIds = Array.isArray(artifact.content?.missing_ids)
        ? artifact.content.missing_ids
        : [];
      return `批量删除预览：存在 ${existingIds.length}，不存在 ${missingIds.length}。${missingIds.length ? ` 不存在的ID：${missingIds.slice(0, 20).join(', ')}${missingIds.length > 20 ? '…' : ''}` : ''}`;
    }

    if (typeKey === 'admin.bulk_delete.result@v1') {
      const results = Array.isArray(artifact.content?.results) ? artifact.content.results : [];
      const deleted = results.filter((r: any) => r?.status === 'deleted').length;
      const failed = results.filter((r: any) => r?.status === 'failed').length;
      const failedPreview = results
        .filter((r: any) => r?.status === 'failed')
        .slice(0, 5)
        .map((r: any) => `${r?.id ?? '?'}(${r?.message ?? r?.error_code ?? 'failed'})`)
        .join(', ');
      return `批量删除完成：成功 ${deleted}，失败 ${failed}${failedPreview ? `。失败示例：${failedPreview}` : ''}`;
    }

    if (typeKey === 'admin.sql_patch.preview@v1') {
      const valid = Boolean(artifact.content?.valid);
      const estimated = Number(artifact.content?.estimated_affected_rows);
      const errors = Array.isArray(artifact.content?.validation_errors)
        ? artifact.content.validation_errors
        : [];
      if (valid) {
        return `SQL Patch 预览通过：预计影响 ${Number.isFinite(estimated) ? estimated : '?'} 行。`;
      }
      const preview = errors.slice(0, 5).join('; ');
      return `SQL Patch 预览失败：${errors.length} 个校验错误${preview ? `（示例：${preview}${errors.length > 5 ? '…' : ''}）` : ''}`;
    }

    if (typeKey === 'admin.sql_patch.result@v1') {
      const status = String(artifact.content?.status || '');
      const affected = Number(artifact.content?.affected_rows);
      const message = String(artifact.content?.message || '');
      if (status === 'succeeded') {
        return `SQL Patch 执行成功：影响 ${Number.isFinite(affected) ? affected : '?'} 行。`;
      }
      return `SQL Patch 执行失败${message ? `：${message}` : ''}`;
    }

    const safeSummary = String(artifact.summary || '').trim();
    if (safeSummary) return `操作完成（${actionId}）：${safeSummary}`;
    return `操作完成（${actionId}）。`;
  }

  private async startInvocation(
    actionId: string,
    params: Record<string, unknown>,
    ctx: BuiltinToolContext,
    options: {
      executionMode: 'blocking' | 'non_blocking';
      requireConfirmation: boolean;
      waitTimeoutMs?: number;
    },
  ): Promise<BuiltinToolResult> {
    const conversationId = _conversationId(ctx);
    if (!conversationId) {
      return {
        content:
          'Save this conversation first. Workbench runs and artifacts must be linked to a durable conversation.',
        error: { message: 'Conversation not saved', type: 'WorkbenchConversationUnsaved' },
        success: false,
      };
    }

    const idempotencyKey = `admin-ops:${actionId}:${ctx.messageId}`;
    const confirmationId = options.requireConfirmation ? `confirm:${ctx.messageId}` : undefined;

    const res = await fetch('/api/workbench/invocations', {
      body: JSON.stringify({
        action_id: actionId,
        confirmation_id: confirmationId,
        conversation_id: conversationId,
        params,
        plugin_id: AdminOpsIdentifier,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      const type =
        res.status === 401
          ? 'WorkbenchUnauthorized'
          : res.status === 403
            ? 'WorkbenchForbidden'
            : 'WorkbenchInvocationFailed';
      return {
        content: `Failed to start admin run: ${text || res.status}`,
        error: { message: text || 'Request failed', type },
        success: false,
      };
    }

    const data = (await res.json()) as StartInvocationResponse;
    const invocationId = data.invocation_id;
    const runId = data.run_id;

    if (options.executionMode === 'blocking') {
      const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs)
        ? Number(options.waitTimeoutMs)
        : 15_000;
      const waited = await this._waitForRunCompletion(runId, { timeoutMs: waitTimeoutMs });
      if (!waited.ok) {
        if (waited.timedOut) {
          return {
            content:
              `已发起操作（${actionId}，run=${runId}），正在执行中。` +
              '若稍后仍未见到结果，请点击此消息下方的运行卡片打开右侧面板查看状态与产物。',
            state: { actionId, conversationId, invocationId, runId },
            success: true,
          };
        }

        return {
          content: `已发起操作（${actionId}，run=${runId}），但获取执行结果失败：${waited.error}`,
          state: { actionId, conversationId, invocationId, runId },
          success: false,
        };
      }

      if (waited.run.state !== 'succeeded') {
        return {
          content: `操作未成功完成（${actionId}，run=${runId}）：${waited.run.state}${waited.run.failure_reason ? `（${waited.run.failure_reason}）` : ''}`,
          state: { actionId, conversationId, invocationId, runId },
          success: false,
        };
      }

      const artifactsRes = await this._fetchJson<_WorkbenchArtifact[]>(
        `/api/workbench/runs/${encodeURIComponent(String(runId))}/artifacts`,
      );
      if (!artifactsRes.ok) {
        return {
          content: `操作已完成（${actionId}，run=${runId}），但读取产物失败：${artifactsRes.error}`,
          state: { actionId, conversationId, invocationId, runId },
          success: false,
        };
      }

      const artifacts = artifactsRes.data || [];
      const latest = artifacts[0];
      if (!latest) {
        return {
          content: `操作已完成（${actionId}，run=${runId}），但未找到产物。`,
          state: { actionId, conversationId, invocationId, runId },
          success: true,
        };
      }

      return {
        content: this._summarizeArtifact(actionId, latest),
        state: { actionId, artifactId: latest.artifact_id, conversationId, invocationId, runId },
        success: true,
      };
    }

    return {
      content:
        `已发起后台任务（${actionId}，run=${runId}）。` +
        '请点击此消息下方的运行卡片打开右侧面板查看状态与产物。',
      state: { actionId, conversationId, invocationId, runId },
      success: true,
    };
  }

  private async presignUpload(
    payload: Record<string, unknown>,
  ): Promise<{ data: PresignUploadResponse; ok: true } | { error: string; ok: false }> {
    const res = await fetch('/api/workbench/object-store/presign-upload', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: text || String(res.status), ok: false };
    }

    return { data: (await res.json()) as PresignUploadResponse, ok: true };
  }

  private async uploadTextToObjectStore(
    text: string,
    purpose: 'sql',
    contentType: 'text/plain',
    filename: string,
  ): Promise<
    | {
        objectKey: string;
        ok: true;
        requiredHeaders: Record<string, string>;
        sha256: string;
        tenantId: number | null;
        uploadUrl: string;
      }
    | { error: string; ok: false }
  > {
    const hash = await sha256Hex(text);

    const presign = await this.presignUpload({
      content_type: contentType,
      filename,
      purpose,
      sha256: hash,
    });

    if (!presign.ok) return presign;

    const { object_key, required_headers, upload_url } = presign.data;
    return {
      objectKey: object_key,
      ok: true,
      requiredHeaders: required_headers,
      sha256: hash,
      tenantId: tenantIdFromObjectKey(object_key),
      uploadUrl: upload_url,
    };
  }

  private async uploadPresignedText(
    text: string,
    presign: { requiredHeaders: Record<string, string>; uploadUrl: string },
  ): Promise<{ ok: true } | { error: string; ok: false }> {
    const put = await fetch(presign.uploadUrl, {
      body: text,
      headers: presign.requiredHeaders,
      method: 'PUT',
    });

    if (!put.ok) {
      const putText = await put.text();
      const preview = putText.slice(0, 500);
      return { error: `upload failed: ${put.status} ${preview}`, ok: false };
    }

    return { ok: true };
  }

  // ===== Entity resolve =====
  resolveEntity = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.entity.resolve', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  // ===== List =====
  listSchools = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.schools', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listClasses = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.classes', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listStudents = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.students', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listTeachers = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.teachers', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listAcademicYears = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.academic_years', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listGrades = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.grades', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  listSubjects = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.list.subjects', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  // ===== CRUD =====
  createSchool = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.school', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateSchool = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.school', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteSchool = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.school', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createClass = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.class', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateClass = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.class', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteClass = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.class', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createTeacher = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.teacher', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateTeacher = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.teacher', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteTeacher = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.teacher', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createStudent = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.student', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateStudent = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.student', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteStudent = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.student', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createAcademicYear = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.academic_year', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateAcademicYear = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.academic_year', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteAcademicYear = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.academic_year', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createGrade = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.grade', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateGrade = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.grade', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteGrade = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.grade', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  createSubject = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.create.subject', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  updateSubject = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.update.subject', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  deleteSubject = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.delete.subject', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
    });

  // ===== Imports =====
  importSchools = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('school', ctx);

  importClasses = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('class', ctx);

  importTeachers = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('teacher', ctx);

  importStudents = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('student', ctx);

  importAcademicYears = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('academic_year', ctx);

  importGrades = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('grade', ctx);

  importSubjects = async (_params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this._openCsvImportUi('subject', ctx);

  // ===== Bulk delete =====
  bulkDeleteStudentsPreview = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.students.preview', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  bulkDeleteStudentsExecute = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.students.execute', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
      waitTimeoutMs: 15_000,
    });

  bulkDeleteSchoolsPreview = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.schools.preview', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  bulkDeleteSchoolsExecute = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.schools.execute', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
      waitTimeoutMs: 15_000,
    });

  bulkDeleteAcademicYearsPreview = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.academic_years.preview', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  bulkDeleteAcademicYearsExecute = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.academic_years.execute', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
      waitTimeoutMs: 15_000,
    });

  bulkDeleteGradesPreview = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.grades.preview', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  bulkDeleteGradesExecute = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.grades.execute', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
      waitTimeoutMs: 15_000,
    });

  bulkDeleteSubjectsPreview = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.subjects.preview', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: false,
    });

  bulkDeleteSubjectsExecute = async (
    params: any,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> =>
    this.startInvocation('admin.bulk_delete.subjects.execute', params, ctx, {
      executionMode: 'blocking',
      requireConfirmation: true,
      waitTimeoutMs: 15_000,
    });

  // ===== SQL patch =====
  sqlPatchPreview = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> => {
    try {
      const rawSql = String(params.sql_text || '');
      const maxAffectedRows = Number(params.max_affected_rows);
      if (!rawSql.trim()) return { content: 'sql_text is required', success: false };
      if (!Number.isFinite(maxAffectedRows) || maxAffectedRows < 1) {
        return { content: 'max_affected_rows must be >= 1', success: false };
      }

      // Presign once to discover tenant id (encoded in object_key), then substitute the placeholder if needed.
      const initialPresign = await this.uploadTextToObjectStore(
        rawSql,
        'sql',
        'text/plain',
        `sql_patch_${ctx.messageId}.sql`,
      );
      if (!initialPresign.ok) {
        return {
          content: `Failed to presign sql_text upload: ${initialPresign.error}`,
          success: false,
        };
      }

      const tenantId = initialPresign.tenantId;
      const substitutedSql =
        tenantId && rawSql.includes('__TENANT_ID__')
          ? rawSql.replaceAll('__TENANT_ID__', String(tenantId))
          : rawSql;

      const finalPresign =
        substitutedSql === rawSql
          ? initialPresign
          : await this.uploadTextToObjectStore(
              substitutedSql,
              'sql',
              'text/plain',
              `sql_patch_${ctx.messageId}.sql`,
            );

      if (!finalPresign.ok) {
        return {
          content: `Failed to presign sql_text upload: ${finalPresign.error}`,
          success: false,
        };
      }

      const uploaded = await this.uploadPresignedText(substitutedSql, finalPresign);
      if (!uploaded.ok) {
        return { content: `Failed to upload sql_text: ${uploaded.error}`, success: false };
      }

      const invocationParams = {
        max_affected_rows: maxAffectedRows,
        sql_ref: {
          integrity: { sha256: finalPresign.sha256 },
          locator: { kind: 'object_store', object_key: finalPresign.objectKey },
          media_type: 'text/plain',
          purpose: 'sql',
          sensitivity: 'restricted',
        },
      };

      return this.startInvocation('admin.sql_patch.preview', invocationParams, ctx, {
        executionMode: 'blocking',
        requireConfirmation: false,
        waitTimeoutMs: 15_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: `Failed to preview SQL patch: ${message}`, success: false };
    }
  };

  sqlPatchExecute = async (params: any, ctx: BuiltinToolContext): Promise<BuiltinToolResult> => {
    try {
      const rawSql = String(params.sql_text || '');
      const maxAffectedRows = Number(params.max_affected_rows);
      if (!rawSql.trim()) return { content: 'sql_text is required', success: false };
      if (!Number.isFinite(maxAffectedRows) || maxAffectedRows < 1) {
        return { content: 'max_affected_rows must be >= 1', success: false };
      }

      const initialPresign = await this.uploadTextToObjectStore(
        rawSql,
        'sql',
        'text/plain',
        `sql_patch_${ctx.messageId}.sql`,
      );
      if (!initialPresign.ok) {
        return {
          content: `Failed to presign sql_text upload: ${initialPresign.error}`,
          success: false,
        };
      }

      const tenantId = initialPresign.tenantId;
      const substitutedSql =
        tenantId && rawSql.includes('__TENANT_ID__')
          ? rawSql.replaceAll('__TENANT_ID__', String(tenantId))
          : rawSql;

      const finalPresign =
        substitutedSql === rawSql
          ? initialPresign
          : await this.uploadTextToObjectStore(
              substitutedSql,
              'sql',
              'text/plain',
              `sql_patch_${ctx.messageId}.sql`,
            );

      if (!finalPresign.ok) {
        return {
          content: `Failed to presign sql_text upload: ${finalPresign.error}`,
          success: false,
        };
      }

      const uploaded = await this.uploadPresignedText(substitutedSql, finalPresign);
      if (!uploaded.ok) {
        return { content: `Failed to upload sql_text: ${uploaded.error}`, success: false };
      }

      const invocationParams = {
        ack: 'I_UNDERSTAND_THIS_WRITES_DB',
        max_affected_rows: maxAffectedRows,
        sql_ref: {
          integrity: { sha256: finalPresign.sha256 },
          locator: { kind: 'object_store', object_key: finalPresign.objectKey },
          media_type: 'text/plain',
          purpose: 'sql',
          sensitivity: 'restricted',
        },
      };

      return this.startInvocation('admin.sql_patch.execute', invocationParams, ctx, {
        executionMode: 'blocking',
        requireConfirmation: true,
        waitTimeoutMs: 20_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: `Failed to execute SQL patch: ${message}`, success: false };
    }
  };
}

export const adminOpsExecutor = new AdminOpsExecutor();
