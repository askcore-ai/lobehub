'use client';

import { UploadOutlined } from '@ant-design/icons';
import { Flexbox } from '@lobehub/ui';
import {
  App,
  Button,
  Checkbox,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import { memo, useEffect, useMemo, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { dbMessageSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';
import { fileChatSelectors, useFileStore } from '@/store/file';

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
type OcrImageCandidateSource = 'conversation_user_image' | 'chat_pending_upload';
type OcrImageCandidate = {
  createdAt: number;
  id: string;
  name: string;
  previewUrl: string;
  source: OcrImageCandidateSource;
  toFile: () => Promise<File>;
};
type SelectedOrderState = string[];
type UploadInputFile = {
  file: File;
  uid: string;
};

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

const contentTypeToExtension = (contentType: string): string => {
  const normalized = String(contentType || '')
    .trim()
    .toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/tiff') return 'tiff';
  return '';
};

const sanitizeFileName = (name: string): string => {
  const safe = String(name || '')
    .trim()
    .replaceAll(/["*/:<>?\\|]+/g, '_');
  return safe || `ocr-image-${Date.now()}`;
};

const ensureFileExtension = (name: string, contentType: string): string => {
  const safe = sanitizeFileName(name);
  if (/\.[\da-z]+$/i.test(safe)) return safe;
  const ext = contentTypeToExtension(contentType);
  return ext ? `${safe}.${ext}` : safe;
};

const fileSignature = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`;

const inferImageContentType = (file: File): string => {
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

const moveSelectedId = (
  order: SelectedOrderState,
  fromId: string,
  toId: string,
): SelectedOrderState => {
  const fromIndex = order.indexOf(fromId);
  const toIndex = order.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;

  const next = order.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const sourceLabelMap: Record<OcrImageCandidateSource, string> = {
  chat_pending_upload: '待发送图片',
  conversation_user_image: '会话图片',
};

const AssignmentOcrStart = memo<Props>(
  ({ conversationId, gradeOptions, optionsLoading = false, subjectOptions }) => {
    const { message } = App.useApp();
    const [inputType, setInputType] = useState<'scan' | 'upload'>('upload');
    const [uploadFiles, setUploadFiles] = useState<UploadInputFile[]>([]);
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
    const [candidateModalOpen, setCandidateModalOpen] = useState(false);
    const [candidateAdding, setCandidateAdding] = useState(false);
    const [selectedOrderState, setSelectedOrderState] = useState<SelectedOrderState>([]);
    const [draggingSelectedId, setDraggingSelectedId] = useState<string | null>(null);
    const activeDbMessages = useChatStore(dbMessageSelectors.activeDbMessages);
    const chatUploadFileList = useFileStore(fileChatSelectors.chatUploadFileList);

    const imageCandidates = useMemo<OcrImageCandidate[]>(() => {
      const out: OcrImageCandidate[] = [];
      const seen = new Set<string>();

      for (const dbMessage of activeDbMessages) {
        if (dbMessage.role !== 'user') continue;
        const imageList = dbMessage.imageList || [];
        const createdAt = Number(dbMessage.createdAt || Date.now());

        for (const image of imageList) {
          const imageUrl = String(image?.url || '').trim();
          if (!imageUrl) continue;

          const candidateId = `conversation:${dbMessage.id}:${image.id}`;
          if (seen.has(candidateId)) continue;
          seen.add(candidateId);

          const rawName = String(image.alt || '').trim();
          const fallbackName = `conversation-image-${image.id || dbMessage.id}.jpg`;
          const fileName = rawName || fallbackName;

          out.push({
            createdAt,
            id: candidateId,
            name: fileName,
            previewUrl: imageUrl,
            source: 'conversation_user_image',
            toFile: async () => {
              const response = await fetch(imageUrl);
              if (!response.ok) {
                throw new Error(`无法获取会话图片：${response.status}`);
              }
              const blob = await response.blob();
              const contentType =
                String(blob.type || '')
                  .trim()
                  .toLowerCase() || 'image/jpeg';
              if (!contentType.startsWith('image/')) {
                throw new Error(`会话图片格式无效：${contentType || 'unknown'}`);
              }

              return new File([blob], ensureFileExtension(fileName, contentType), {
                lastModified: Number.isFinite(createdAt) ? createdAt : Date.now(),
                type: contentType,
              });
            },
          });
        }
      }

      for (const [index, item] of chatUploadFileList.entries()) {
        const file = item.file;
        if (!(file instanceof File)) continue;
        if (
          !String(file.type || '')
            .toLowerCase()
            .startsWith('image/')
        )
          continue;
        if (item.status === 'error' || item.status === 'cancelled') continue;

        const candidateId = `pending:${item.id}`;
        if (seen.has(candidateId)) continue;
        seen.add(candidateId);

        out.push({
          createdAt: Date.now() + index,
          id: candidateId,
          name: file.name || `pending-image-${item.id}.jpg`,
          previewUrl: item.previewUrl || item.fileUrl || '',
          source: 'chat_pending_upload',
          toFile: async () => file,
        });
      }

      return out.sort((a, b) => b.createdAt - a.createdAt);
    }, [activeDbMessages, chatUploadFileList]);

    const candidateMap = useMemo(
      () => new Map(imageCandidates.map((candidate) => [candidate.id, candidate])),
      [imageCandidates],
    );

    const uploadFileList = useMemo<UploadFile[]>(
      () =>
        uploadFiles.map((f) => ({
          name: f.file.name,
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

    useEffect(() => {
      setSelectedOrderState((prev) => prev.filter((id) => candidateMap.has(id)));
    }, [candidateMap]);

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

    const addLocalUploadFile = (file: File, uid: string) => {
      setUploadFiles((prev) => {
        const signature = fileSignature(file);
        if (prev.some((item) => fileSignature(item.file) === signature)) return prev;
        return [...prev, { file, uid }];
      });
    };

    const toggleCandidateSelection = (candidateId: string, checked: boolean) => {
      setSelectedOrderState((prev) => {
        if (checked) {
          if (prev.includes(candidateId)) return prev;
          return [...prev, candidateId];
        }
        return prev.filter((id) => id !== candidateId);
      });
    };

    const handleSelectedDrop = (targetId: string) => {
      if (!draggingSelectedId || draggingSelectedId === targetId) return;
      setSelectedOrderState((prev) => moveSelectedId(prev, draggingSelectedId, targetId));
      setDraggingSelectedId(null);
    };

    const openCandidateModal = () => {
      if (imageCandidates.length === 0) {
        message.warning('当前会话没有可用图片。');
        return;
      }
      setCandidateModalOpen(true);
    };

    const addSelectedCandidates = async () => {
      if (selectedOrderState.length === 0) {
        message.warning('请先选择图片。');
        return;
      }

      setCandidateAdding(true);
      try {
        const orderedCandidates: OcrImageCandidate[] = [];
        for (const id of selectedOrderState) {
          const candidate = candidateMap.get(id);
          if (candidate) orderedCandidates.push(candidate);
        }

        if (orderedCandidates.length === 0) {
          message.warning('所选图片已不可用，请重新选择。');
          return;
        }

        const existingSignatures = new Set(uploadFiles.map((item) => fileSignature(item.file)));
        const added: UploadInputFile[] = [];

        for (const candidate of orderedCandidates) {
          const file = await candidate.toFile();
          const signature = fileSignature(file);
          if (existingSignatures.has(signature)) continue;
          existingSignatures.add(signature);
          added.push({
            file,
            uid: `candidate:${candidate.id}:${crypto.randomUUID()}`,
          });
        }

        if (added.length === 0) {
          message.info('所选图片均已在上传列表中。');
          return;
        }

        setUploadFiles((prev) => [...prev, ...added]);
        setCandidateModalOpen(false);
        setSelectedOrderState([]);
        message.success(`已添加 ${added.length} 张图片。`);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '从会话读取图片失败');
      } finally {
        setCandidateAdding(false);
      }
    };

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
          for (const uploadFile of uploadFiles) {
            const file = uploadFile.file;
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
                addLocalUploadFile(rc, rc.uid);
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
            <Button
              disabled={imageCandidates.length === 0}
              onClick={openCandidateModal}
              size="small"
            >
              从会话图片选择
            </Button>
            <Typography.Text type="secondary">候选图片：{imageCandidates.length}</Typography.Text>
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

        <Modal
          cancelText="取消"
          okButtonProps={{ disabled: selectedOrderState.length === 0, loading: candidateAdding }}
          okText="添加到上传列表"
          onCancel={() => {
            if (!candidateAdding) setCandidateModalOpen(false);
          }}
          onOk={() => void addSelectedCandidates()}
          open={candidateModalOpen}
          title="从会话图片选择"
        >
          <Flexbox gap={8}>
            <Typography.Text type="secondary">
              可选择当前会话用户图片与输入框待发送图片。按勾选顺序默认排序，并支持拖拽调整。
            </Typography.Text>

            {imageCandidates.length === 0 ? (
              <Typography.Text type="secondary">当前没有可用候选图片。</Typography.Text>
            ) : (
              <Flexbox gap={8} style={{ maxHeight: 260, overflowY: 'auto' }}>
                {imageCandidates.map((candidate) => {
                  const checked = selectedOrderState.includes(candidate.id);
                  return (
                    <Flexbox
                      align="center"
                      gap={8}
                      horizontal
                      key={candidate.id}
                      style={{
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(event) =>
                          toggleCandidateSelection(candidate.id, event.target.checked)
                        }
                      />
                      {candidate.previewUrl ? (
                        <img
                          alt={candidate.name}
                          src={candidate.previewUrl}
                          style={{
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 6,
                            flexShrink: 0,
                            height: 44,
                            objectFit: 'cover',
                            width: 44,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            alignItems: 'center',
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 6,
                            color: 'rgba(0,0,0,0.45)',
                            display: 'flex',
                            fontSize: 12,
                            height: 44,
                            justifyContent: 'center',
                            width: 44,
                          }}
                        >
                          IMG
                        </div>
                      )}
                      <Flexbox gap={2} style={{ minWidth: 0 }}>
                        <Typography.Text ellipsis style={{ maxWidth: 280 }}>
                          {candidate.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {sourceLabelMap[candidate.source]}
                        </Typography.Text>
                      </Flexbox>
                    </Flexbox>
                  );
                })}
              </Flexbox>
            )}

            <Typography.Text strong>已选顺序（可拖拽）</Typography.Text>
            {selectedOrderState.length === 0 ? (
              <Typography.Text type="secondary">请先在上方勾选图片。</Typography.Text>
            ) : (
              <Flexbox gap={6}>
                {selectedOrderState.map((candidateId, index) => {
                  const candidate = candidateMap.get(candidateId);
                  if (!candidate) return null;
                  return (
                    <Flexbox
                      draggable
                      gap={8}
                      horizontal
                      justify="space-between"
                      key={candidateId}
                      onDragEnd={() => setDraggingSelectedId(null)}
                      onDragOver={(event) => {
                        event.preventDefault();
                      }}
                      onDragStart={() => setDraggingSelectedId(candidateId)}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleSelectedDrop(candidateId);
                      }}
                      style={{
                        border: '1px dashed rgba(0,0,0,0.16)',
                        borderRadius: 8,
                        cursor: 'grab',
                        opacity: draggingSelectedId === candidateId ? 0.5 : 1,
                        padding: '6px 8px',
                      }}
                    >
                      <Typography.Text>
                        {index + 1}. {candidate.name}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {sourceLabelMap[candidate.source]}
                      </Typography.Text>
                    </Flexbox>
                  );
                })}
              </Flexbox>
            )}
          </Flexbox>
        </Modal>
      </Flexbox>
    );
  },
);

export default AssignmentOcrStart;
