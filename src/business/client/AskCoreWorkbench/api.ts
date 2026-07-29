'use client';

import {
  type ActivityDetailResponse,
  type AnyResourceKey,
  type AskCoreEducationProfile,
  type AskCoreOrganizationState,
  type AskCoreWorkbenchDashboardPayload,
  type AskCoreWorkbenchListPayload,
  type AssignmentDetailResponse,
  type AttemptDetailResponse,
  type JsonRecord,
  type PluginArtifact,
  type PluginInvocation,
  type PluginInvocationArtifacts,
  type PresignUploadResponse,
  type PrinterDeviceListResponse,
  type ProtocolCaptureStartInput,
  type ProtocolCaptureStatus,
  type ProtocolIdentityLinkAcceptResult,
  type ProtocolIdentityLinkAccountSubjectResult,
  type ProtocolProcessingContext,
  type ProtocolProcessingEditInput,
  type ProtocolProcessingEditResult,
  type ProtocolProcessingReportResult,
  type ProtocolProcessingSurface,
  type ProtocolScannerList,
  type ResourceItemResponse,
  type ResourceKey,
  type ResourceListResponse,
  type ResourceMutationResponse,
  type ScannerDeviceListResponse,
  type StudentDetailResponse,
  type SubmissionDetailResponse,
} from './types';

const WORKBENCH_API_BASE = '/api/askcore/workbench';
const ORGANIZATION_API_BASE = '/api/askcore/organizations';
const PROTOCOL_API_BASE = '/api/askcore/lti';
const DEFAULT_PAGE_SIZE = 100;
const processingContextExchanges = new Map<string, Promise<ProtocolProcessingContext>>();

type AskCoreOrganizationPayloadSummary = {
  createdAt?: string;
  id: string;
  isActive: boolean;
  logo?: string | null;
  name: string;
  role?: string | null;
  slug?: string;
};

type AskCoreOrganizationPayload = {
  current: AskCoreOrganizationPayloadSummary | null;
  organizations: AskCoreOrganizationPayloadSummary[];
};

export class AskCoreWorkbenchApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AskCoreWorkbenchApiError';
    this.status = status;
  }
}

export const isAskCoreWorkbenchDeleteNotFound = (reason: unknown) =>
  reason instanceof AskCoreWorkbenchApiError &&
  (reason.status === 404 ||
    (reason.status === 400 && /\bnot found\b|未找到/i.test(reason.message)));

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const formatValidationDetail = (detail: unknown): string | null => {
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (isRecord(item)) {
          const loc = Array.isArray(item.loc)
            ? item.loc.map((entry) => String(entry)).join('.')
            : '';
          const message = String(item.msg || item.message || JSON.stringify(item));
          return loc ? `${loc}: ${message}` : message;
        }
        return String(item || '');
      })
      .filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }
  if (isRecord(detail)) {
    if (detail.detail !== undefined) return formatValidationDetail(detail.detail);
    return String(detail.message || JSON.stringify(detail));
  }
  if (detail === undefined || detail === null || detail === '') return null;
  return String(detail);
};

const resolveErrorDetail = (payload: unknown, fallbackText: string) => {
  const topLevel = formatValidationDetail(payload);
  if (topLevel && !isRecord(payload)) return topLevel;
  if (isRecord(payload)) {
    const formatted = formatValidationDetail(payload.detail);
    if (formatted) return formatted;
  }
  return fallbackText;
};

const readResponsePayload = async (response: Response) => {
  const text = await response.text();
  try {
    return {
      payload: text ? JSON.parse(text) : {},
      text,
    };
  } catch {
    return {
      payload: { raw: text },
      text,
    };
  }
};

const buildQuery = (params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

const readErrorMessage = async (response: Response) => {
  const { payload, text } = await readResponsePayload(response);
  return resolveErrorDetail(payload, text || response.statusText).slice(0, 360);
};

export const fetchAskCoreWorkbenchJson = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new AskCoreWorkbenchApiError(await readErrorMessage(response), response.status);
  }

  const { payload } = await readResponsePayload(response);
  return payload as T;
};

const protocolJson = <T>(path: string, init: RequestInit = {}) =>
  fetchAskCoreWorkbenchJson<T>(`${PROTOCOL_API_BASE}${path}`, init);

const protocolMutation = (method: 'PATCH' | 'POST', payload?: unknown): RequestInit => ({
  body: payload === undefined ? undefined : JSON.stringify(payload),
  headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
  method,
});

const protocolLaunchPath = (path: string, launchScope: string) =>
  `${path}${buildQuery({ launch: launchScope })}`;

export const fetchProtocolProcessingContext = (launchScope: string) => {
  const existing = processingContextExchanges.get(launchScope);
  if (existing) return existing;
  const exchange = protocolJson<ProtocolProcessingContext>(
    protocolLaunchPath('/processing/context', launchScope),
    protocolMutation('POST'),
  );
  processingContextExchanges.set(launchScope, exchange);
  const clear = () => {
    if (processingContextExchanges.get(launchScope) === exchange) {
      processingContextExchanges.delete(launchScope);
    }
  };
  void exchange.then(clear, clear);
  return exchange;
};

export const acceptProtocolIdentityLinkInvitation = (invitationToken: string) =>
  protocolJson<ProtocolIdentityLinkAcceptResult>(
    '/identity-links/accept',
    protocolMutation('POST', { invitation_token: invitationToken }),
  );

export const fetchCurrentProtocolIdentityLinkAccountSubject = () =>
  protocolJson<ProtocolIdentityLinkAccountSubjectResult>('/identity-links/account-subject');

export const fetchCurrentProtocolProcessingSurface = (launchScope: string) =>
  protocolJson<ProtocolProcessingSurface>(protocolLaunchPath('/processing/current', launchScope));

export const editCurrentProtocolProcessingResult = (
  launchScope: string,
  payload: ProtocolProcessingEditInput,
) =>
  protocolJson<ProtocolProcessingEditResult>(
    protocolLaunchPath('/processing/current/result', launchScope),
    protocolMutation('PATCH', payload),
  );

export const generateCurrentProtocolProcessingReport = (launchScope: string) =>
  protocolJson<ProtocolProcessingReportResult>(
    protocolLaunchPath('/processing/current/report', launchScope),
    protocolMutation('POST'),
  );

export const fetchProtocolCaptureScanners = (launchScope: string) =>
  protocolJson<ProtocolScannerList>(
    protocolLaunchPath('/processing/capture/scanners', launchScope),
  );

export const startProtocolCapture = (launchScope: string, payload: ProtocolCaptureStartInput) =>
  protocolJson<ProtocolCaptureStatus>(
    protocolLaunchPath('/processing/capture/jobs', launchScope),
    protocolMutation('POST', payload),
  );

export const fetchProtocolCaptureStatus = (launchScope: string, captureId: string) =>
  protocolJson<ProtocolCaptureStatus>(
    protocolLaunchPath(`/processing/capture/jobs/${encodeURIComponent(captureId)}`, launchScope),
  );

export const continueProtocolCapture = (launchScope: string, captureId: string) =>
  protocolJson<ProtocolCaptureStatus>(
    protocolLaunchPath(
      `/processing/capture/jobs/${encodeURIComponent(captureId)}/continue`,
      launchScope,
    ),
    protocolMutation('POST', {}),
  );

export const cancelProtocolCapture = (launchScope: string, captureId: string) =>
  protocolJson<ProtocolCaptureStatus>(
    protocolLaunchPath(
      `/processing/capture/jobs/${encodeURIComponent(captureId)}/cancel`,
      launchScope,
    ),
    protocolMutation('POST', {}),
  );

export const askCoreWorkbenchResourceUrl = (resource: string, page: number, pageSize: number) =>
  `${WORKBENCH_API_BASE}/${resource}${buildQuery({
    include_total: 'true',
    page: String(page),
    page_size: String(pageSize),
  })}`;

export const askCoreWorkbenchItemUrl = (resource: string, entityId: string | number) =>
  `${WORKBENCH_API_BASE}/${resource}/${entityId}`;

export const askCoreWorkbenchDashboardUrl = () => `${WORKBENCH_API_BASE}/dashboard`;

export const askCoreWorkbenchOrganizationUrl = () => ORGANIZATION_API_BASE;

const normalizeOrganizationSummary = (
  organization: AskCoreOrganizationPayloadSummary,
): AskCoreOrganizationState['organizations'][number] => ({
  created_at: organization.createdAt,
  is_active: organization.isActive,
  logo_url: organization.logo,
  name: organization.name,
  organization_id: organization.id,
  role: organization.role,
  slug: organization.slug,
  source: 'membership',
});

const normalizeOrganizationState = (
  payload: AskCoreOrganizationPayload,
): AskCoreOrganizationState => ({
  is_super_admin: false,
  organization: payload.current ? normalizeOrganizationSummary(payload.current) : null,
  organization_role: payload.current?.role,
  organizations: payload.organizations.map(normalizeOrganizationSummary),
});

export const emptyAskCoreWorkbenchList = (
  resource: string,
  page: number,
  pageSize: number,
): AskCoreWorkbenchListPayload => ({
  has_more: false,
  items: [],
  page,
  page_size: pageSize,
  resource,
  total: 0,
});

export const emptyAskCoreWorkbenchDashboard = (): AskCoreWorkbenchDashboardPayload => ({
  active_invocations: [],
  counts: {},
  drafts: [],
  recent_invocations: [],
});

type BlobResponse = {
  blob: Blob;
  filename: string;
  mediaType: string;
};

export type BlobDownloadProgress = {
  loaded: number;
  percent: number | null;
  phase: 'completed' | 'downloading';
  total: number | null;
};

type ScanUploadProgress = {
  completed: number;
  fileName: string;
  index: number;
  phase: 'presigning' | 'uploaded' | 'uploading';
  total: number;
};

export class AskCoreWorkbenchApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = WORKBENCH_API_BASE) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private url(path: string) {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}) {
    return fetchAskCoreWorkbenchJson<T>(this.url(path), init);
  }

  private resolveDownloadFilename(response: Response, fallbackName: string) {
    const header = response.headers.get('content-disposition') || '';
    const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
      try {
        return decodeURIComponent(encodedMatch[1]);
      } catch {
        return encodedMatch[1];
      }
    }
    const quotedMatch = header.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = header.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return fallbackName;
  }

  private async readBlobWithProgress(
    response: Response,
    mediaType: string,
    onProgress: ((progress: BlobDownloadProgress) => void) | undefined,
  ) {
    if (!onProgress || !response.body) return response.blob();

    const totalHeader = Number(response.headers.get('content-length') || 0) || 0;
    const total = totalHeader > 0 ? totalHeader : null;
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let loaded = 0;
    onProgress({ loaded, percent: total ? 0 : null, phase: 'downloading', total });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
      loaded += value.byteLength;
      onProgress({
        loaded,
        percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : null,
        phase: 'downloading',
        total,
      });
    }

    onProgress({ loaded, percent: total ? 100 : null, phase: 'completed', total });
    return new Blob(chunks, { type: mediaType });
  }

  private async requestBlob(
    path: string,
    {
      fallbackName = 'download.bin',
      onProgress,
      ...init
    }: RequestInit & {
      fallbackName?: string;
      onProgress?: (progress: BlobDownloadProgress) => void;
    } = {},
  ): Promise<BlobResponse> {
    const response = await fetch(this.url(path), {
      ...init,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new AskCoreWorkbenchApiError(await readErrorMessage(response), response.status);
    }

    const mediaType = response.headers.get('content-type') || 'application/octet-stream';
    return {
      blob: await this.readBlobWithProgress(response, mediaType, onProgress),
      filename: this.resolveDownloadFilename(response, fallbackName),
      mediaType,
    };
  }

  listResource(
    resource: AnyResourceKey,
    filters: JsonRecord = {},
    options: {
      afterId?: number | null;
      includeTotal?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const query = new URLSearchParams({
      include_total: String(options.includeTotal ?? true),
      page: String(options.page ?? 1),
      page_size: String(options.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    if (options.afterId) query.set('after_id', String(options.afterId));
    if (Object.keys(filters).length) query.set('filters', JSON.stringify(filters));
    return this.requestJson<ResourceListResponse>(`/${resource}?${query.toString()}`);
  }

  async listAllResource(resource: AnyResourceKey, filters: JsonRecord = {}) {
    const items: JsonRecord[] = [];
    let afterId: number | null = null;

    for (let page = 1; page <= 20; page += 1) {
      const response = await this.listResource(resource, filters, {
        afterId,
        includeTotal: page === 1,
        page,
        pageSize: 100,
      });
      items.push(...response.items);
      if (!response.has_more || !response.next_after_id) break;
      afterId = response.next_after_id;
    }

    return items;
  }

  getOrganizationUnits() {
    return this.requestJson<{ org_id: string; units: JsonRecord[] }>('/organization/units');
  }

  getResource(resource: AnyResourceKey, entityId: number) {
    return this.requestJson<ResourceItemResponse>(`/${resource}/${entityId}`);
  }

  createResource(resource: ResourceKey, payload: JsonRecord) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}`, {
      body: JSON.stringify({ payload }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  updateResource(resource: ResourceKey, entityId: number, patch: JsonRecord) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}/${entityId}`, {
      body: JSON.stringify({ patch }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
  }

  deleteResource(resource: ResourceKey, entityId: number) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}/${entityId}`, {
      method: 'DELETE',
    });
  }

  createAssignmentDetailResource(
    resource: 'assignment-questions' | 'assignment-students',
    payload: JsonRecord,
  ) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}`, {
      body: JSON.stringify({ payload }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  updateAssignmentDetailResource(
    resource: 'assignment-questions' | 'assignment-students',
    entityId: number,
    patch: JsonRecord,
  ) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}/${entityId}`, {
      body: JSON.stringify({ patch }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
  }

  deleteAssignmentDetailResource(
    resource: 'assignment-questions' | 'assignment-students',
    entityId: number,
  ) {
    return this.requestJson<ResourceMutationResponse>(`/${resource}/${entityId}`, {
      method: 'DELETE',
    });
  }

  getDashboard() {
    return this.requestJson<AskCoreWorkbenchDashboardPayload>('/dashboard');
  }

  getEducationProfile() {
    return this.requestJson<AskCoreEducationProfile>('/me');
  }

  getOrganizationState() {
    return fetchAskCoreWorkbenchJson<AskCoreOrganizationPayload>(
      askCoreWorkbenchOrganizationUrl(),
    ).then(normalizeOrganizationState);
  }

  getAssignmentDetail(assignmentId: number) {
    return this.requestJson<AssignmentDetailResponse>(`/assignments/${assignmentId}/detail`);
  }

  getActivityDetail(activityId: number) {
    return this.requestJson<ActivityDetailResponse>(`/activities/${activityId}/detail`);
  }

  getSubmissionDetail(submissionId: number) {
    return this.requestJson<SubmissionDetailResponse>(`/submissions/${submissionId}/detail`);
  }

  getAttemptDetail(attemptId: number) {
    return this.requestJson<AttemptDetailResponse>(`/attempts/${attemptId}/detail`);
  }

  getStudentDetail(studentId: number) {
    return this.requestJson<StudentDetailResponse>(`/students/${studentId}/detail`);
  }

  listScannerDevices() {
    return this.requestJson<ScannerDeviceListResponse>('/devices/scanners');
  }

  listPrinterDevices() {
    return this.requestJson<PrinterDeviceListResponse>('/devices/printers');
  }

  invokeAction(action: string, params: JsonRecord, confirmationId?: string) {
    const requestId = `askcore-workbench-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return this.requestJson<{
      action_id: string;
      invocation_id: string;
      plugin_id: string;
      run_id: number;
      status: string;
    }>(`/actions/${encodeURIComponent(action)}`, {
      body: JSON.stringify({
        confirmation_id: confirmationId,
        conversation_id: `first-party-workbench:${Date.now()}`,
        params,
        request_id: requestId,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': requestId,
      },
      method: 'POST',
    });
  }

  getInvocation(invocationId: string) {
    return this.requestJson<PluginInvocation>(`/invocations/${encodeURIComponent(invocationId)}`);
  }

  getInvocationStreamUrl(invocationId: string) {
    return this.url(`/invocations/${encodeURIComponent(invocationId)}/stream`);
  }

  listInvocationArtifacts(invocationId: string) {
    return this.requestJson<PluginInvocationArtifacts>(
      `/invocations/${encodeURIComponent(invocationId)}/artifacts`,
    );
  }

  getArtifact(artifactId: string) {
    return this.requestJson<PluginArtifact>(`/artifacts/${encodeURIComponent(artifactId)}`);
  }

  presignUpload(payload: {
    content_type: string;
    filename?: string;
    purpose: 'csv' | 'scan' | 'sql';
    sha256?: string;
  }) {
    return this.requestJson<PresignUploadResponse>('/uploads/presign', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  async uploadFile(file: File, signed: PresignUploadResponse) {
    const response = await fetch(signed.upload_url, {
      body: file,
      headers: signed.required_headers,
      method: 'PUT',
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(
        `Upload failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`,
      );
    }
  }

  async uploadScanFiles(
    files: File[],
    options: {
      onProgress?: (progress: ScanUploadProgress) => void;
    } = {},
  ) {
    const refs: Array<{
      content_type: string;
      locator: { kind: 'object_store'; object_key: string };
    }> = [];

    for (const [index, file] of files.entries()) {
      options.onProgress?.({
        completed: refs.length,
        fileName: file.name,
        index,
        phase: 'presigning',
        total: files.length,
      });
      const signed = await this.presignUpload({
        content_type: file.type || 'image/jpeg',
        filename: file.name,
        purpose: 'scan',
      });
      options.onProgress?.({
        completed: refs.length,
        fileName: file.name,
        index,
        phase: 'uploading',
        total: files.length,
      });
      await this.uploadFile(file, signed);
      refs.push({
        content_type: file.type || 'image/jpeg',
        locator: { kind: 'object_store', object_key: signed.object_key },
      });
      options.onProgress?.({
        completed: refs.length,
        fileName: file.name,
        index,
        phase: 'uploaded',
        total: files.length,
      });
    }

    return refs;
  }

  fetchPreviewBlob(objectKey: string, options: { download?: boolean } = {}) {
    const query = new URLSearchParams({ object_key: objectKey });
    if (options.download) query.set('download', '1');
    return this.requestBlob(`/files/preview?${query.toString()}`, {
      fallbackName: objectKey.split('/').at(-1) || 'preview.bin',
    });
  }

  async fetchPreviewBlobUrl(objectKey: string) {
    const response = await this.fetchPreviewBlob(objectKey);
    return URL.createObjectURL(response.blob);
  }

  downloadSubmissionReportsZip(
    submissionIds: number[],
    options: { onProgress?: (progress: BlobDownloadProgress) => void } = {},
  ) {
    return this.requestBlob('/submissions/reports/download', {
      body: JSON.stringify({ submission_ids: submissionIds }),
      fallbackName: 'submission-reports.zip',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      onProgress: options.onProgress,
    });
  }

  downloadAttemptReportsZip(
    attemptIds: number[],
    options: { onProgress?: (progress: BlobDownloadProgress) => void } = {},
  ) {
    return this.requestBlob('/attempts/reports/download', {
      body: JSON.stringify({ attempt_ids: attemptIds }),
      fallbackName: 'submission-reports.zip',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      onProgress: options.onProgress,
    });
  }
}

export const askCoreWorkbenchClient = new AskCoreWorkbenchApiClient();
