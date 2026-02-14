'use client';

import { UploadOutlined } from '@ant-design/icons';
import { Flexbox } from '@lobehub/ui';
import { App, Button, InputNumber, Select, Space, Switch, Typography, Upload } from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import { memo, useEffect, useMemo, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

type StartInvocationResponse = { invocation_id: string; run_id: number };
type PresignUploadResponse = {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
};
type ScannerListResponse = {
  default_scanner_id: string | null;
  items: Array<{ kind: 'escl' | 'simulated'; scanner_id: string }>;
};
type OptionItem = { label: string; value: number };

type Props = {
  conversationId: string;
  gradeOptions: OptionItem[];
  optionsLoading?: boolean;
  subjectOptions: OptionItem[];
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

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const inferImageContentType = (file: RcFile): string => {
  const fromType = String(file.type || '')
    .trim()
    .toLowerCase();
  if (fromType.startsWith('image/')) return fromType;

  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return '';
};

const AssignmentOcrStart = memo<Props>(
  ({ conversationId, gradeOptions, optionsLoading = false, subjectOptions }) => {
    const { message } = App.useApp();
    const [inputType, setInputType] = useState<'scan' | 'upload'>('upload');
    const [uploadFiles, setUploadFiles] = useState<RcFile[]>([]);
    const [subjectId, setSubjectId] = useState<number | null>(null);
    const [gradeId, setGradeId] = useState<number | null>(null);
    const [scannerOptions, setScannerOptions] = useState<Array<{ label: string; value: string }>>(
      [],
    );
    const [scanScannerId, setScanScannerId] = useState<string | null>(null);
    const [scanMedia, setScanMedia] = useState<'A3' | 'A4' | 'B4' | 'B5'>('A4');
    const [scanDuplex, setScanDuplex] = useState<boolean>(true);
    const [scanPages, setScanPages] = useState<number | null>(null);
    const [scannerLoading, setScannerLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const uploadFileList = useMemo<UploadFile[]>(
      () =>
        uploadFiles.map((f) => ({
          name: f.name,
          status: 'done',
          uid: f.uid,
        })),
      [uploadFiles],
    );

    useEffect(() => {
      setSubjectId((prev) => {
        if (prev && subjectOptions.some((opt) => opt.value === prev)) return prev;
        return subjectOptions[0]?.value ?? null;
      });
    }, [subjectOptions]);

    useEffect(() => {
      setGradeId((prev) => {
        if (prev && gradeOptions.some((opt) => opt.value === prev)) return prev;
        return gradeOptions[0]?.value ?? null;
      });
    }, [gradeOptions]);

    useEffect(() => {
      let cancelled = false;
      const loadScanners = async () => {
        setScannerLoading(true);
        try {
          const out = await fetchJson<ScannerListResponse>('/api/workbench/devices/scanners');
          if (cancelled) return;
          const options = (out.items || []).map((item) => ({
            label: `${item.scanner_id} (${item.kind})`,
            value: item.scanner_id,
          }));
          setScannerOptions(options);
          const defaultId = out.default_scanner_id || options[0]?.value || null;
          setScanScannerId((prev) => {
            if (prev && options.some((item) => item.value === prev)) return prev;
            return defaultId;
          });
        } catch (err) {
          if (cancelled) return;
          setScannerOptions([]);
          setScanScannerId(null);
          message.error(err instanceof Error ? err.message : '加载扫描仪列表失败');
        } finally {
          if (!cancelled) setScannerLoading(false);
        }
      };
      void loadScanners();
      return () => {
        cancelled = true;
      };
    }, [message]);

    const canStart = useMemo(
      () =>
        Boolean(subjectId && subjectId > 0 && gradeId && gradeId > 0) &&
        (inputType === 'upload'
          ? uploadFiles.length > 0
          : scanScannerId !== null || scannerOptions.length > 0) &&
        !submitting &&
        !optionsLoading,
      [
        gradeId,
        inputType,
        optionsLoading,
        scanScannerId,
        scannerOptions.length,
        subjectId,
        submitting,
        uploadFiles.length,
      ],
    );

    const start = async () => {
      if (!(subjectId && subjectId > 0) || !(gradeId && gradeId > 0)) {
        message.error('请选择学科和年级。');
        return;
      }
      if (inputType === 'upload' && uploadFiles.length === 0) {
        message.error('请先选择原始图片。');
        return;
      }
      if (inputType === 'scan' && !scanScannerId && scannerOptions.length === 0) {
        message.error('当前租户未配置扫描仪。');
        return;
      }

      setSubmitting(true);
      try {
        const params: Record<string, unknown> = {
          grade_id: Number(gradeId),
          input_type: inputType,
          subject_id: Number(subjectId),
        };

        if (inputType === 'upload') {
          const scanRefs: Array<Record<string, unknown>> = [];
          for (const file of uploadFiles) {
            const contentType = inferImageContentType(file);
            if (!contentType.startsWith('image/')) {
              throw new Error(`不支持的图片类型：${file.name}`);
            }

            const buf = await file.arrayBuffer();
            const hash = await sha256Hex(buf);
            const presigned = await fetchJson<PresignUploadResponse>(
              '/api/workbench/object-store/presign-upload',
              {
                body: JSON.stringify({
                  content_type: contentType,
                  filename: file.name,
                  purpose: 'scan',
                  sha256: hash,
                }),
                method: 'POST',
              },
            );

            const put = await fetch(presigned.upload_url, {
              body: file,
              headers: presigned.required_headers,
              method: 'PUT',
            });
            if (!put.ok) {
              const putText = await put.text();
              const preview = putText.slice(0, 500);
              throw new Error(`upload failed: ${put.status} ${preview}`);
            }

            scanRefs.push({
              content_type: contentType,
              locator: { kind: 'object_store', object_key: presigned.object_key },
              sha256: hash,
            });
          }
          params.scan_refs = scanRefs;
        } else {
          if (scanScannerId) params.scan_scanner_id = scanScannerId;
          params.scan_media = scanMedia;
          params.scan_duplex = scanDuplex;
          if (scanPages && scanPages > 0) params.scan_pages = Number(scanPages);
        }

        const idempotencyKey = `ui:assignment.draft.create_from_ocr:${crypto.randomUUID()}`;
        const confirmationId = `ui-confirm:${crypto.randomUUID()}`;

        const out = await fetchJson<StartInvocationResponse>('/api/workbench/invocations', {
          body: JSON.stringify({
            action_id: 'assignment.draft.create_from_ocr',
            confirmation_id: confirmationId,
            conversation_id: conversationId,
            params,
            plugin_id: 'admin.ops.v1',
          }),
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          method: 'POST',
        });

        message.success(`OCR started (run ${out.run_id}).`);
        if (inputType === 'upload') setUploadFiles([]);
        useChatStore.getState().pushPortalView({
          conversationId,
          runId: out.run_id,
          type: PortalViewType.Workbench,
        });
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'OCR start failed');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Flexbox
        gap={8}
        style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          OCR 导入（Assignment Authoring）
        </Typography.Title>
        <Typography.Text type="secondary">
          支持两种 OCR 录入方式：上传原始图片（upload）或扫描仪录入（scan）。两种方式都会先提取
          `scan_text`，再进入同一套题目结构化流水线，最终创建 `assignment.draft@v1`。
        </Typography.Text>

        <Space wrap>
          <Typography.Text>录入方式</Typography.Text>
          <Select
            onChange={(v) => setInputType(v as 'scan' | 'upload')}
            options={[
              { label: '上传原始图片', value: 'upload' },
              { label: '扫描仪录入', value: 'scan' },
            ]}
            size="small"
            style={{ width: 160 }}
            value={inputType}
          />
          <Typography.Text>学科</Typography.Text>
          <Select
            loading={optionsLoading}
            onChange={(v) => setSubjectId(Number(v))}
            options={subjectOptions}
            placeholder="选择学科"
            size="small"
            style={{ width: 180 }}
            value={subjectId ?? undefined}
          />
          <Typography.Text>年级</Typography.Text>
          <Select
            loading={optionsLoading}
            onChange={(v) => setGradeId(Number(v))}
            options={gradeOptions}
            placeholder="选择年级"
            size="small"
            style={{ width: 180 }}
            value={gradeId ?? undefined}
          />
        </Space>

        {inputType === 'upload' ? (
          <Space wrap>
            <Upload
              accept="image/*"
              beforeUpload={(rc: RcFile) => {
                setUploadFiles((prev) =>
                  prev.some((f) => f.uid === rc.uid) ? prev : [...prev, rc],
                );
                return false;
              }}
              fileList={uploadFileList}
              multiple
              onRemove={(removed) => {
                setUploadFiles((prev) => prev.filter((f) => f.uid !== removed.uid));
                return true;
              }}
            >
              <Button icon={<UploadOutlined />} size="small">
                选择原始图片
              </Button>
            </Upload>
          </Space>
        ) : (
          <Space wrap>
            <Typography.Text>扫描仪</Typography.Text>
            <Select
              allowClear
              loading={scannerLoading}
              onChange={(v) => setScanScannerId(v ?? null)}
              options={scannerOptions}
              placeholder={scannerLoading ? '加载中...' : '选择扫描仪'}
              size="small"
              style={{ width: 220 }}
              value={scanScannerId ?? undefined}
            />
            <Typography.Text>纸张</Typography.Text>
            <Select
              onChange={(v) => setScanMedia(v as 'A3' | 'A4' | 'B4' | 'B5')}
              options={['A3', 'A4', 'B4', 'B5'].map((v) => ({ label: v, value: v }))}
              size="small"
              style={{ width: 90 }}
              value={scanMedia}
            />
            <Typography.Text>双面</Typography.Text>
            <Switch checked={scanDuplex} onChange={setScanDuplex} size="small" />
            <Typography.Text>页数</Typography.Text>
            <InputNumber
              max={100}
              min={1}
              onChange={(v) => setScanPages(typeof v === 'number' ? v : null)}
              placeholder="可选"
              size="small"
              style={{ width: 100 }}
              value={scanPages ?? undefined}
            />
          </Space>
        )}

        <Space wrap>
          <Button
            disabled={!canStart}
            loading={submitting}
            onClick={start}
            size="small"
            type="primary"
          >
            Start OCR
          </Button>
        </Space>
      </Flexbox>
    );
  },
);

export default AssignmentOcrStart;
