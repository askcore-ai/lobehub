import { randomUUID } from 'node:crypto';

import type { ModelRuntimeHooks } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';

import { askCoreAssertionHeaderName, buildAskCoreAssertion } from '@/server/services/askcoreAssertion';

export function getBusinessModelRuntimeHooks(
  _userId: string,
  _provider: string,
): ModelRuntimeHooks | undefined {
  return undefined;
}

type RuntimeLike = Record<string, any>;

type AskCoreBillingRuntimeOptions = {
  provider: string;
  userId: string;
};

const BILLING_SURFACE = 'lobehub:model-runtime';
const BILLING_METHODS = ['chat', 'generateObject', 'embeddings', 'createImage', 'createVideo'] as const;

const askCoreApiBaseUrl = () =>
  (
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    'http://api:8000'
  ).replace(/\/+$/, '');

const compactMetadata = (metadata: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

const modelFromPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return undefined;
  const model = (payload as Record<string, unknown>).model;
  return typeof model === 'string' && model ? model : undefined;
};

const quotaError = (detail: any) => ({
  error: detail || {
    billing_url: '/settings/plans',
    code: 'quota_exhausted',
    message: '额度不足，请充值后继续',
  },
  errorMessage: detail?.message || '额度不足，请充值后继续',
  errorType: ChatErrorType.InsufficientBudgetForModel,
});

const askCoreBillingMetadata = (
  options: AskCoreBillingRuntimeOptions,
  actionId: string,
  payload: unknown,
) =>
  compactMetadata({
    askcore_action_id: actionId,
    askcore_billing_context_type: 'user',
    askcore_idempotency_key: `lobehub:${actionId}:${randomUUID()}`,
    askcore_model_provider: options.provider,
    askcore_surface: BILLING_SURFACE,
    askcore_user_id: options.userId,
    model: modelFromPayload(payload),
  });

const mergePayloadMetadata = (payload: unknown, metadata: Record<string, unknown>) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const existing = (payload as Record<string, unknown>).litellm_metadata;
  return {
    ...(payload as Record<string, unknown>),
    litellm_metadata: {
      ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
      ...metadata,
    },
  };
};

const preflightAskCoreUsage = async (
  options: AskCoreBillingRuntimeOptions,
  actionId: string,
  payload: unknown,
  metadata: Record<string, unknown>,
) => {
  const assertion = await buildAskCoreAssertion({
    permissions: ['project:read', 'project:write'],
    roles: ['workbench_user'],
    sub: options.userId,
  });
  const response = await fetch(`${askCoreApiBaseUrl()}/api/billing/v1/usage/check`, {
    body: JSON.stringify({
      amount_credits: 1,
      metadata,
      model: modelFromPayload(payload),
      surface: BILLING_SURFACE,
    }),
    headers: {
      'Content-Type': 'application/json',
      [askCoreAssertionHeaderName()]: assertion,
    },
    method: 'POST',
  });
  if (response.ok) return;

  let detail: any;
  try {
    const body = await response.json();
    detail = body?.detail || body;
  } catch {
    detail = undefined;
  }
  if (response.status === 402) throw quotaError(detail);
  throw new Error(`AskCore billing preflight failed: ${response.status}`);
};

export function wrapAskCoreBillingRuntime<T extends RuntimeLike>(
  runtime: T,
  options: AskCoreBillingRuntimeOptions,
): T {
  const mutableRuntime = runtime as RuntimeLike;
  for (const methodName of BILLING_METHODS) {
    const original = mutableRuntime[methodName];
    if (typeof original !== 'function') continue;
    mutableRuntime[methodName] = async (
      payload: unknown,
      runtimeOptions?: unknown,
      ...rest: unknown[]
    ) => {
      const metadata = askCoreBillingMetadata(options, methodName, payload);
      await preflightAskCoreUsage(options, methodName, payload, metadata);
      return original.call(
        runtime,
        mergePayloadMetadata(payload, metadata),
        runtimeOptions,
        ...rest,
      );
    };
  }
  return runtime;
}
