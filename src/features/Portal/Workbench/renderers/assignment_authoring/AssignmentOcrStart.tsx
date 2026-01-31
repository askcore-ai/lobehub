'use client';

import { UploadOutlined } from '@ant-design/icons';
import { Flexbox } from '@lobehub/ui';
import { App, Button, InputNumber, Space, Typography, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { memo, useMemo, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

type StartInvocationResponse = { invocation_id: string; run_id: number };
type PresignUploadResponse = {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
};

type Props = {
  conversationId: string;
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

const AssignmentOcrStart = memo<Props>(({ conversationId }) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [subjectId, setSubjectId] = useState<number>(1);
  const [gradeId, setGradeId] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const canStart = useMemo(
    () => !!file && subjectId > 0 && gradeId > 0 && !submitting,
    [file, gradeId, subjectId, submitting],
  );

  const start = async () => {
    if (!file) {
      message.error('Please select a scan text file first.');
      return;
    }
    if (!(subjectId > 0) || !(gradeId > 0)) {
      message.error('subject_id / grade_id must be >= 1.');
      return;
    }

    setSubmitting(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      const contentType = String(file.type || 'text/plain').trim();

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

      const idempotencyKey = `ui:assignment.draft.create_from_ocr:${crypto.randomUUID()}`;
      const confirmationId = `ui-confirm:${crypto.randomUUID()}`;

      const out = await fetchJson<StartInvocationResponse>('/api/workbench/invocations', {
        body: JSON.stringify({
          action_id: 'assignment.draft.create_from_ocr',
          confirmation_id: confirmationId,
          conversation_id: conversationId,
          params: {
            grade_id: gradeId,
            scan_ref: {
              content_type: contentType,
              locator: { kind: 'object_store', object_key: presigned.object_key },
              sha256: hash,
            },
            subject_id: subjectId,
          },
          plugin_id: 'assignment.authoring.v1',
        }),
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        method: 'POST',
      });

      message.success(`OCR started (run ${out.run_id}).`);
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
    <Flexbox gap={8} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        OCR 导入（Assignment Authoring）
      </Typography.Title>
      <Typography.Text type="secondary">
        当前 v1 OCR 流程默认接收 text/plain（例如：上游 OCR 引擎的识别文本）。上传成功后将创建
        `assignment.draft@v1`，并写入 `questions_by_llm`（存档）与 `questions`（可编辑）。
      </Typography.Text>

      <Space wrap>
        <Typography.Text>subject_id</Typography.Text>
        <InputNumber
          min={1}
          onChange={(v) => setSubjectId(Number(v || 0))}
          size="small"
          value={subjectId}
        />
        <Typography.Text>grade_id</Typography.Text>
        <InputNumber
          min={1}
          onChange={(v) => setGradeId(Number(v || 0))}
          size="small"
          value={gradeId}
        />
      </Space>

      <Space wrap>
        <Upload
          accept=".txt,text/plain"
          beforeUpload={(rc: RcFile) => {
            setFile(rc as unknown as File);
            return false;
          }}
          fileList={
            file
              ? [
                  {
                    name: file.name,
                    status: 'done',
                    uid: file.name,
                  } as any,
                ]
              : []
          }
          maxCount={1}
          onRemove={() => {
            setFile(null);
            return true;
          }}
        >
          <Button icon={<UploadOutlined />} size="small">
            Select scan text
          </Button>
        </Upload>
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
});

export default AssignmentOcrStart;
