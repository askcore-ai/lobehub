'use client';

import { Alert, Skeleton, Tag } from '@lobehub/ui';
import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { RefreshCw, ScanLine, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { message } from '@/components/AntdStaticMethods';

import {
  AskCoreWorkbenchApiError,
  cancelProtocolCapture,
  continueProtocolCapture,
  fetchProtocolCaptureScanners,
  fetchProtocolCaptureStatus,
  startProtocolCapture,
} from './api';
import {
  type ProtocolCaptureInputSource,
  type ProtocolCaptureMedia,
  type ProtocolCaptureStatus,
  type ProtocolProcessingContext,
  type ProtocolScanner,
} from './types';

const CAPTURE_RESUME_STORAGE_PREFIX = 'askcore.lti.capture.v1.';
const CAPTURE_RESUME_VERSION = 1;
const CAPTURE_ID_PATTERN = /^[\w.~-]{1,128}$/;

type CaptureTranslate = (key: string, options?: Record<string, unknown>) => string;

const CAPTURE_FAILURE_MESSAGE_KEYS: Record<string, string> = {
  'device_agent.execution_failed': 'askcoreProcessing.capture.failure.deviceExecution',
  'device_agent.failed': 'askcoreProcessing.capture.failure.deviceExecution',
  'scanner.paper_jam': 'askcoreProcessing.capture.failure.paperJam',
};

type CaptureResumeBinding = {
  expiresAt: number;
  fingerprint: string;
  storageKey: string;
};

type PersistedCaptureReference = {
  binding_fingerprint: string;
  capture_id: string;
  context_expires_at: number;
  saved_at: number;
  version: number;
};

const captureResumeBinding = async (
  context: ProtocolProcessingContext,
): Promise<CaptureResumeBinding | undefined> => {
  if (!context.return_url || !context.purpose) return;
  const expiresAt = Date.parse(context.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !window.crypto?.subtle) return;

  const binding = JSON.stringify({
    context_kind: context.context_kind,
    expires_at: context.expires_at,
    purpose: context.purpose,
    return_url: context.return_url,
    run_kind: context.run_kind,
  });
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(binding));
  const fingerprint = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  return {
    expiresAt,
    fingerprint,
    storageKey: `${CAPTURE_RESUME_STORAGE_PREFIX}${fingerprint}`,
  };
};

const removePersistedCapture = (binding: CaptureResumeBinding | undefined) => {
  if (!binding) return;
  try {
    window.localStorage.removeItem(binding.storageKey);
  } catch {
    // Browser storage is a recovery aid; server-side ticket and account checks remain authoritative.
  }
};

const prunePersistedCaptures = () => {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(CAPTURE_RESUME_STORAGE_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        const payload = raw ? (JSON.parse(raw) as Partial<PersistedCaptureReference>) : undefined;
        if (
          payload?.version !== CAPTURE_RESUME_VERSION ||
          typeof payload.context_expires_at !== 'number' ||
          payload.context_expires_at <= Date.now() ||
          typeof payload.saved_at !== 'number' ||
          typeof payload.capture_id !== 'string' ||
          !CAPTURE_ID_PATTERN.test(payload.capture_id)
        ) {
          window.localStorage.removeItem(key);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore unavailable browser storage; the backend remains the recovery authority.
  }
};

const persistCapture = (binding: CaptureResumeBinding | undefined, captureId: string) => {
  if (!binding || !CAPTURE_ID_PATTERN.test(captureId)) return;
  const payload: PersistedCaptureReference = {
    binding_fingerprint: binding.fingerprint,
    capture_id: captureId,
    context_expires_at: binding.expiresAt,
    saved_at: Date.now(),
    version: CAPTURE_RESUME_VERSION,
  };
  try {
    window.localStorage.setItem(binding.storageKey, JSON.stringify(payload));
  } catch {
    // A blocked/quota-limited store must not stop an active scanner job.
  }
};

const readPersistedCapture = (
  binding: CaptureResumeBinding,
): PersistedCaptureReference | undefined => {
  try {
    const raw = window.localStorage.getItem(binding.storageKey);
    if (!raw) return;
    const payload = JSON.parse(raw) as Partial<PersistedCaptureReference>;
    if (
      payload.version !== CAPTURE_RESUME_VERSION ||
      payload.binding_fingerprint !== binding.fingerprint ||
      payload.context_expires_at !== binding.expiresAt ||
      typeof payload.saved_at !== 'number' ||
      payload.saved_at > Date.now() + 60_000 ||
      typeof payload.capture_id !== 'string' ||
      !CAPTURE_ID_PATTERN.test(payload.capture_id) ||
      binding.expiresAt <= Date.now()
    ) {
      removePersistedCapture(binding);
      return;
    }
    return payload as PersistedCaptureReference;
  } catch {
    removePersistedCapture(binding);
    return;
  }
};

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  `,
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: ${cssVar.colorBgContainer};
  `,
  cardBody: css`
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
  `,
  cardHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 14px;
    padding-inline: 18px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  `,
  fieldLabel: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(150px, 1fr));
    gap: 16px;

    @media (width <= 860px) {
      grid-template-columns: repeat(2, minmax(140px, 1fr));
    }

    @media (width <= 560px) {
      grid-template-columns: 1fr;
    }
  `,
  heading: css`
    display: flex;
    gap: 12px;
    align-items: center;
  `,
  help: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 10px;

    padding-block: 12px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 13px;
    line-height: 1.55;
    color: ${cssVar.colorTextDescription};

    background: ${cssVar.colorFillQuaternary};

    @media (width <= 700px) {
      grid-template-columns: 1fr;
    }
  `,
  icon: css`
    display: grid;
    place-items: center;

    width: 40px;
    height: 40px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorPrimary};
  `,
  meta: css`
    margin-block-start: 3px;
    font-size: 13px;
    color: ${cssVar.colorTextDescription};
  `,
  page: css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    min-width: 0;
    padding-block: 16px 28px;
    padding-inline: clamp(12px, 2vw, 28px);
  `,
  status: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
  `,
  switchRow: css`
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 32px;
  `,
  title: css`
    margin: 0;

    font-size: 21px;
    font-weight: 650;
    line-height: 1.3;
    color: ${cssVar.colorText};
  `,
}));

const captureError = (reason: unknown, fallback: string, t: CaptureTranslate) => {
  if (!(reason instanceof AskCoreWorkbenchApiError)) {
    return fallback;
  }
  if (reason.status === 401) return fallback;
  if (reason.status === 403) return fallback;
  if (reason.status === 404 || reason.status === 410) {
    return t('askcoreProcessing.capture.error.expired');
  }
  if (reason.status === 409) return t('askcoreProcessing.capture.error.conflict');
  if (reason.status >= 500) return fallback;
  return fallback;
};

const captureFailureMessage = (
  failure: NonNullable<ProtocolCaptureStatus['failure']>,
  t: CaptureTranslate,
) => t(CAPTURE_FAILURE_MESSAGE_KEYS[failure.code] || 'askcoreProcessing.capture.failure.generic');

const terminalCaptureStatuses = new Set(['cancelled', 'completed', 'failed']);

export const ProtocolCaptureSurface = memo(
  ({ context }: { context: ProtocolProcessingContext }) => {
    const { t } = useTranslation('common');
    const [scanners, setScanners] = useState<ProtocolScanner[]>([]);
    const [scannerId, setScannerId] = useState('');
    const [media, setMedia] = useState<ProtocolCaptureMedia | undefined>();
    const [inputSource, setInputSource] = useState<ProtocolCaptureInputSource>('auto');
    const [duplex, setDuplex] = useState(false);
    const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
    const [backRotation, setBackRotation] = useState<0 | 180>(0);
    const [capture, setCapture] = useState<ProtocolCaptureStatus>();
    const [resumeBinding, setResumeBinding] = useState<CaptureResumeBinding>();
    const [restoring, setRestoring] = useState(true);
    const [loading, setLoading] = useState(true);
    const [mutating, setMutating] = useState(false);
    const [error, setError] = useState<string>();

    const moodleReturnUrl = useMemo(() => {
      if (
        capture?.status !== 'completed' ||
        capture.capture_state !== 'completed' ||
        !capture.receipt ||
        !context.return_url
      )
        return;
      try {
        const target = new URL(context.return_url);
        target.searchParams.set('receipt', capture.receipt);
        return target.toString();
      } catch {
        return;
      }
    }, [capture, context.return_url]);

    const loadScanners = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
        const payload = await fetchProtocolCaptureScanners();
        const available = payload.scanners.filter((scanner) => scanner.online);
        setScanners(available);
        setScannerId((current) =>
          available.some((scanner) => scanner.scanner_id === current)
            ? current
            : available[0]?.scanner_id || '',
        );
      } catch (reason) {
        setError(
          captureError(reason, t('askcoreProcessing.capture.error.load'), t as CaptureTranslate),
        );
      } finally {
        setLoading(false);
      }
    }, [t]);

    useEffect(() => {
      void loadScanners();
    }, [loadScanners]);

    useEffect(() => {
      let active = true;
      setCapture(undefined);
      setResumeBinding(undefined);
      setRestoring(true);

      const restore = async () => {
        let binding: CaptureResumeBinding | undefined;
        try {
          prunePersistedCaptures();
          binding = await captureResumeBinding(context);
          if (!active) return;
          setResumeBinding(binding);
          if (!binding) return;

          const persisted = readPersistedCapture(binding);
          if (!persisted) return;
          try {
            const restored = await fetchProtocolCaptureStatus(persisted.capture_id);
            if (!active) return;
            setCapture(restored);
            persistCapture(binding, restored.capture_id);
          } catch (reason) {
            if (reason instanceof AskCoreWorkbenchApiError && [404, 410].includes(reason.status)) {
              removePersistedCapture(binding);
            }
            if (active) {
              setError(
                captureError(
                  reason,
                  t('askcoreProcessing.capture.error.status'),
                  t as CaptureTranslate,
                ),
              );
            }
          }
        } catch {
          // Keep a valid opaque capture reference on transient browser/runtime failures.
        } finally {
          if (active) setRestoring(false);
        }
      };

      void restore();
      return () => {
        active = false;
      };
    }, [context, t]);

    const scanner = scanners.find((item) => item.scanner_id === scannerId);
    const hasPlaten = scanner?.capabilities.input_sources.includes('platen') === true;
    const hasAdf =
      scanner?.capabilities.input_sources.some((source) => source.startsWith('adf_')) === true;
    const supportsDuplex = scanner?.capabilities.input_sources.includes('adf_duplex') === true;
    const sourceCategoryCount = Number(hasPlaten) + Number(hasAdf);

    useEffect(() => {
      const mediaOptions = scanner?.capabilities.media || [];
      if (!media || !mediaOptions.includes(media)) setMedia(mediaOptions[0]);
      if (sourceCategoryCount === 1) setInputSource(hasPlaten ? 'platen' : 'adf');
      if (inputSource === 'platen' && !hasPlaten) setInputSource(hasAdf ? 'adf' : 'auto');
      if (inputSource === 'adf' && !hasAdf) setInputSource(hasPlaten ? 'platen' : 'auto');
      if (!supportsDuplex || inputSource === 'platen') setDuplex(false);
    }, [hasAdf, hasPlaten, inputSource, media, scanner, sourceCategoryCount, supportsDuplex]);

    useEffect(() => {
      if (!capture || terminalCaptureStatuses.has(capture.status)) return;
      const timer = window.setInterval(async () => {
        try {
          setCapture(await fetchProtocolCaptureStatus(capture.capture_id));
        } catch (reason) {
          setError(
            captureError(
              reason,
              t('askcoreProcessing.capture.error.status'),
              t as CaptureTranslate,
            ),
          );
        }
      }, 2000);
      return () => window.clearInterval(timer);
    }, [capture, t]);

    const sourceOptions = useMemo(() => {
      const options: Array<{
        label: string;
        value: ProtocolCaptureInputSource;
      }> = [];
      if (hasPlaten || hasAdf) {
        options.push({
          label: t('askcoreProcessing.capture.source.auto'),
          value: 'auto',
        });
      }
      if (hasPlaten) {
        options.push({
          label: t('askcoreProcessing.capture.source.platen'),
          value: 'platen',
        });
      }
      if (hasAdf) {
        options.push({
          label: t('askcoreProcessing.capture.source.adf'),
          value: 'adf',
        });
      }
      return options;
    }, [hasAdf, hasPlaten, t]);

    const start = async () => {
      if (!scanner || !media || !context.capabilities.can_start_capture) return;
      setMutating(true);
      setError(undefined);
      try {
        const next = await startProtocolCapture({
          back_side_rotation_degrees: duplex ? backRotation : 0,
          duplex,
          input_source_mode: inputSource,
          media,
          rotation_degrees: rotation,
          scanner_id: scanner.scanner_id,
        });
        setCapture(next);
        persistCapture(resumeBinding, next.capture_id);
        message.success(t('askcoreProcessing.capture.started'));
      } catch (reason) {
        setError(
          captureError(reason, t('askcoreProcessing.capture.error.start'), t as CaptureTranslate),
        );
      } finally {
        setMutating(false);
      }
    };

    const continueCapture = async () => {
      if (!capture) return;
      setMutating(true);
      setError(undefined);
      try {
        const next = await continueProtocolCapture(capture.capture_id);
        setCapture(next);
        persistCapture(resumeBinding, next.capture_id);
      } catch (reason) {
        setError(
          captureError(
            reason,
            t('askcoreProcessing.capture.error.continue'),
            t as CaptureTranslate,
          ),
        );
      } finally {
        setMutating(false);
      }
    };

    const cancel = async () => {
      if (!capture) return;
      setMutating(true);
      setError(undefined);
      try {
        setCapture(await cancelProtocolCapture(capture.capture_id));
      } catch (reason) {
        setError(
          captureError(reason, t('askcoreProcessing.capture.error.cancel'), t as CaptureTranslate),
        );
      } finally {
        setMutating(false);
      }
    };

    if (loading || restoring) {
      return (
        <div className={styles.page}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      );
    }

    return (
      <main className={styles.page}>
        <header className={styles.heading}>
          <div className={styles.icon}>
            <ScanLine size={20} />
          </div>
          <div>
            <h1 className={styles.title}>{t('askcoreProcessing.capture.title')}</h1>
            <div className={styles.meta}>{t('askcoreProcessing.capture.subtitle')}</div>
          </div>
        </header>

        {error ? <Alert showIcon title={error} type="error" /> : null}
        {!context.capabilities.can_list_scanners || !context.capabilities.can_start_capture ? (
          <Alert showIcon title={t('askcoreProcessing.capture.error.permission')} type="warning" />
        ) : null}
        {!scanners.length && !capture ? (
          <Alert
            showIcon
            description={t('askcoreProcessing.capture.empty.description')}
            title={t('askcoreProcessing.capture.empty.title')}
            type="info"
            action={
              <Button icon={<RefreshCw size={14} />} onClick={() => void loadScanners()}>
                {t('askcoreProcessing.capture.refresh')}
              </Button>
            }
          />
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <strong>{t('askcoreProcessing.capture.configuration')}</strong>
              <Tag>
                {t(`askcoreProcessing.capture.purpose.${context.purpose || 'student_submission'}`)}
              </Tag>
            </div>
            <div className={styles.cardBody}>
              {scanners.length ? (
                <>
                  <div className={styles.grid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {t('askcoreProcessing.capture.scanner')}
                      </span>
                      <Select
                        aria-label={t('askcoreProcessing.capture.scanner')}
                        value={scannerId}
                        options={scanners.map((item) => ({
                          label: item.display_name,
                          value: item.scanner_id,
                        }))}
                        onChange={setScannerId}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {t('askcoreProcessing.capture.media')}
                      </span>
                      <Select
                        aria-label={t('askcoreProcessing.capture.media')}
                        value={media}
                        options={(scanner?.capabilities.media || []).map((value) => ({
                          label: value,
                          value,
                        }))}
                        onChange={(value) => setMedia(value as ProtocolCaptureMedia)}
                      />
                    </label>
                    {sourceCategoryCount > 1 ? (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {t('askcoreProcessing.capture.source')}
                        </span>
                        <Select
                          aria-label={t('askcoreProcessing.capture.source')}
                          options={sourceOptions}
                          value={inputSource}
                          onChange={(value) => setInputSource(value as ProtocolCaptureInputSource)}
                        />
                      </label>
                    ) : null}
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {t('askcoreProcessing.capture.sides')}
                      </span>
                      <span className={styles.switchRow}>
                        <Switch
                          aria-label={t('askcoreProcessing.capture.sides')}
                          checked={duplex}
                          disabled={!supportsDuplex || inputSource === 'platen'}
                          onChange={setDuplex}
                        />
                        {t(
                          duplex
                            ? 'askcoreProcessing.capture.sides.duplex'
                            : 'askcoreProcessing.capture.sides.simplex',
                        )}
                      </span>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {t('askcoreProcessing.capture.rotation')}
                      </span>
                      <Select
                        aria-label={t('askcoreProcessing.capture.rotation')}
                        value={rotation}
                        options={[0, 90, 180, 270].map((value) => ({
                          label: `${value}°`,
                          value,
                        }))}
                        onChange={(value) => setRotation(value as 0 | 90 | 180 | 270)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {t('askcoreProcessing.capture.backRotation')}
                      </span>
                      <Select
                        aria-label={t('askcoreProcessing.capture.backRotation')}
                        disabled={!duplex}
                        value={backRotation}
                        options={[0, 180].map((value) => ({
                          label: `${value}°`,
                          value,
                        }))}
                        onChange={(value) => setBackRotation(value as 0 | 180)}
                      />
                    </label>
                  </div>

                  <div className={styles.help}>
                    <span>{t('askcoreProcessing.capture.help.source')}</span>
                    <span>{t('askcoreProcessing.capture.help.backRotation')}</span>
                  </div>
                </>
              ) : null}

              {capture ? (
                <div className={styles.status}>
                  <div>
                    <strong>{t(`askcoreProcessing.capture.status.${capture.status}`)}</strong>
                    <div className={styles.meta}>
                      {t('askcoreProcessing.capture.pages', {
                        count: capture.committed_page_count,
                      })}
                    </div>
                  </div>
                  <div className={styles.actions}>
                    {capture.capture_state === 'continuation_required' ? (
                      <Button
                        loading={mutating}
                        type="primary"
                        onClick={() => void continueCapture()}
                      >
                        {t('askcoreProcessing.capture.continue')}
                      </Button>
                    ) : null}
                    {!terminalCaptureStatuses.has(capture.status) ? (
                      <Button
                        danger
                        icon={<X size={14} />}
                        loading={mutating}
                        onClick={() => void cancel()}
                      >
                        {t('askcoreProcessing.capture.cancel')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <Button
                    disabled={!scanner || !media || !context.capabilities.can_start_capture}
                    icon={<ScanLine size={16} />}
                    loading={mutating}
                    type="primary"
                    onClick={() => void start()}
                  >
                    {t('askcoreProcessing.capture.start')}
                  </Button>
                  <Button icon={<RefreshCw size={14} />} onClick={() => void loadScanners()}>
                    {t('askcoreProcessing.capture.refresh')}
                  </Button>
                </div>
              )}

              {capture?.status === 'completed' && capture.capture_state === 'completed' ? (
                <>
                  <Alert
                    showIcon
                    description={t('askcoreProcessing.capture.completed.description')}
                    title={t('askcoreProcessing.capture.completed.title')}
                    type="success"
                  />
                  {moodleReturnUrl ? (
                    <div className={styles.actions}>
                      <Button href={moodleReturnUrl} type="primary">
                        {t('askcoreProcessing.capture.returnToMoodle')}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {capture?.failure ? (
                <Alert
                  showIcon
                  title={captureFailureMessage(capture.failure, t as CaptureTranslate)}
                  type="error"
                />
              ) : null}
            </div>
          </section>
        )}
      </main>
    );
  },
);

ProtocolCaptureSurface.displayName = 'ProtocolCaptureSurface';
