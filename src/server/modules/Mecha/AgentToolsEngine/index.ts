/**
 * Server-side Agent Tools Engine
 *
 * This module provides the same functionality as the frontend `createAgentToolsEngine`,
 * but fetches data from the database instead of frontend stores.
 *
 * Key differences from frontend:
 * - Gets installed plugins from context (fetched from database)
 * - Gets model capabilities from provided function
 * - No dependency on frontend stores (useToolStore, useAgentStore, etc.)
 */
import { KnowledgeBaseManifest } from '@lobechat/builtin-tool-knowledge-base';
import { LocalSystemManifest } from '@lobechat/builtin-tool-local-system';
import { WebBrowsingManifest } from '@lobechat/builtin-tool-web-browsing';
import { type LobeToolManifest, ToolsEngine } from '@lobechat/context-engine';
import debug from 'debug';
import { type ApiPrompt, Langfuse } from 'langfuse';

import { getLangfuseConfig } from '@/envs/langfuse';
import { builtinTools } from '@/tools';

import type {
  ServerAgentToolsContext,
  ServerAgentToolsEngineConfig,
  ServerCreateAgentToolsEngineParams,
} from './types';

export type {
  InstalledPlugin,
  ServerAgentToolsContext,
  ServerAgentToolsEngineConfig,
  ServerCreateAgentToolsEngineParams,
} from './types';

const log = debug('lobe-server:agent-tools-engine');

const ADMIN_OPS_IDENTIFIER = 'admin.ops.v1';
const ADMIN_OPS_LANGFUSE_PROMPT_NAME = 'workbench.tool.admin_ops.v1.system@v1';
const ADMIN_OPS_LANGFUSE_PROMPT_LABEL = 'production';
const ADMIN_OPS_LANGFUSE_PROMPT_TTL_MS = 60_000;

const ASSIGNMENT_AUTHORING_IDENTIFIER = 'assignment.authoring.v1';

type _CachedPrompt = {
  fetchedAtMs: number;
  promptLabel: string;
  promptName: string;
  promptVersion: number;
  systemRole: string;
  ttlMs: number;
};

let _adminOpsPromptCache: _CachedPrompt | undefined;

const _mergeAdminOpsSystemRole = (options: {
  langfuseSystemRole: string | undefined;
  toolDefaultSystemRole: string | undefined;
}): string | undefined => {
  const toolDefault = String(options.toolDefaultSystemRole || '').trim();
  const langfuse = String(options.langfuseSystemRole || '').trim();

  if (!toolDefault && !langfuse) return;
  if (!langfuse) return toolDefault || undefined;
  if (!toolDefault) return langfuse || undefined;

  return [
    'Authoritative capability reference (must follow this section first):',
    toolDefault,
    '',
    '---',
    '',
    'Supplemental policy guidance from Langfuse (apply only when not conflicting with the authoritative capability reference above):',
    langfuse,
  ].join('\n');
};

const _extractSystemRoleFromPrompt = (prompt: ApiPrompt): string | undefined => {
  if (!prompt) return;

  if (prompt.type === 'text') {
    const text = String(prompt.prompt || '').trim();
    return text ? text : undefined;
  }

  if (prompt.type === 'chat') {
    const parts: string[] = [];
    for (const msg of prompt.prompt || []) {
      if (!msg) continue;
      if (msg.type === 'chatmessage') {
        const role = String((msg as any).role || '')
          .trim()
          .toLowerCase();
        const content = String((msg as any).content || '').trim();
        if (!content) continue;
        if (role === 'system') parts.push(content);
      }
    }

    if (parts.length > 0) return parts.join('\n\n');

    // Fallback: join all message contents (including placeholders) if no system role was provided.
    const allParts: string[] = [];
    for (const msg of prompt.prompt || []) {
      if (!msg) continue;
      if (msg.type === 'chatmessage') {
        const content = String((msg as any).content || '').trim();
        if (content) allParts.push(content);
      } else if (msg.type === 'placeholder') {
        const name = String((msg as any).name || '').trim();
        if (name) allParts.push(`{{${name}}}`);
      }
    }
    return allParts.length > 0 ? allParts.join('\n\n') : undefined;
  }

  return;
};

const _resolveAdminOpsSystemRoleFromLangfuse = async (): Promise<_CachedPrompt | undefined> => {
  const now = Date.now();
  if (
    _adminOpsPromptCache &&
    now - _adminOpsPromptCache.fetchedAtMs <= _adminOpsPromptCache.ttlMs
  ) {
    return _adminOpsPromptCache;
  }

  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST } = getLangfuseConfig();

  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    return _adminOpsPromptCache;
  }

  try {
    const client = new Langfuse({
      baseUrl: LANGFUSE_HOST,
      publicKey: LANGFUSE_PUBLIC_KEY,
      secretKey: LANGFUSE_SECRET_KEY,
    });

    const prompt = await client.api.promptsGet({
      label: ADMIN_OPS_LANGFUSE_PROMPT_LABEL,
      promptName: ADMIN_OPS_LANGFUSE_PROMPT_NAME,
    });

    const systemRole = _extractSystemRoleFromPrompt(prompt);
    if (!systemRole) return _adminOpsPromptCache;

    _adminOpsPromptCache = {
      fetchedAtMs: now,
      promptLabel: ADMIN_OPS_LANGFUSE_PROMPT_LABEL,
      promptName: ADMIN_OPS_LANGFUSE_PROMPT_NAME,
      promptVersion: Number((prompt as any).version || 0),
      systemRole,
      ttlMs: ADMIN_OPS_LANGFUSE_PROMPT_TTL_MS,
    };

    log(
      'Resolved admin ops systemRole from Langfuse prompt=%s label=%s version=%s',
      _adminOpsPromptCache.promptName,
      _adminOpsPromptCache.promptLabel,
      String(_adminOpsPromptCache.promptVersion),
    );

    return _adminOpsPromptCache;
  } catch (error) {
    log('Failed to resolve admin ops systemRole from Langfuse: %O', error);
    return _adminOpsPromptCache;
  }
};

/**
 * Initialize ToolsEngine with server-side context
 *
 * This is the server-side equivalent of frontend's `createToolsEngine`
 *
 * @param context - Server context with installed plugins and model checker
 * @param config - Optional configuration
 * @returns ToolsEngine instance
 */
export const createServerToolsEngine = (
  context: ServerAgentToolsContext,
  config: ServerAgentToolsEngineConfig = {},
): ToolsEngine => {
  const {
    enableChecker,
    additionalManifests = [],
    builtinManifests: builtinManifestsOverride,
    defaultToolIds,
  } = config;

  // Get plugin manifests from installed plugins (from database)
  const pluginManifests = context.installedPlugins
    .map((plugin) => plugin.manifest as LobeToolManifest)
    .filter(Boolean);

  // Get all builtin tool manifests
  const builtinManifests =
    builtinManifestsOverride ?? builtinTools.map((tool) => tool.manifest as LobeToolManifest);

  // Combine all manifests
  const allManifests = [...pluginManifests, ...builtinManifests, ...additionalManifests];

  log(
    'Creating ToolsEngine with %d plugin manifests, %d builtin manifests, %d additional manifests',
    pluginManifests.length,
    builtinManifests.length,
    additionalManifests.length,
  );

  return new ToolsEngine({
    defaultToolIds,
    enableChecker,
    functionCallChecker: context.isModelSupportToolUse,
    manifestSchemas: allManifests,
  });
};

/**
 * Create a ToolsEngine for agent chat with server-side context
 *
 * This is the server-side equivalent of frontend's `createAgentToolsEngine`
 *
 * @param context - Server context with installed plugins and model checker
 * @param params - Agent config and model info
 * @returns ToolsEngine instance configured for the agent
 */
export const createServerAgentToolsEngine = async (
  context: ServerAgentToolsContext,
  params: ServerCreateAgentToolsEngineParams,
): Promise<ToolsEngine> => {
  const {
    additionalManifests,
    agentConfig,
    hasEnabledKnowledgeBases = false,
    model,
    provider,
  } = params;
  const searchMode = agentConfig.chatConfig?.searchMode ?? 'off';
  const isSearchEnabled = searchMode !== 'off';

  log(
    'Creating agent tools engine for model=%s, provider=%s, searchMode=%s, additionalManifests=%d',
    model,
    provider,
    searchMode,
    additionalManifests?.length ?? 0,
  );

  const requestedToolIds = Array.from(
    new Set(
      (agentConfig.plugins ?? []).map((id) =>
        id === ASSIGNMENT_AUTHORING_IDENTIFIER ? ADMIN_OPS_IDENTIFIER : id,
      ),
    ),
  );
  const shouldInjectAdminOpsPrompt = requestedToolIds.includes(ADMIN_OPS_IDENTIFIER);
  const adminOpsPrompt = shouldInjectAdminOpsPrompt
    ? await _resolveAdminOpsSystemRoleFromLangfuse()
    : undefined;

  const builtinManifests = builtinTools
    .map((tool) => tool.manifest as LobeToolManifest)
    .map((m) => {
      if (m.identifier === ADMIN_OPS_IDENTIFIER && adminOpsPrompt?.systemRole) {
        return {
          ...m,
          systemRole: _mergeAdminOpsSystemRole({
            langfuseSystemRole: adminOpsPrompt.systemRole,
            toolDefaultSystemRole: m.systemRole,
          }),
        };
      }

      return m;
    });

  return createServerToolsEngine(context, {
    // Pass additional manifests (e.g., LobeHub Skills)
    additionalManifests,

    builtinManifests,
    // Add default tools based on configuration
    defaultToolIds: [WebBrowsingManifest.identifier, KnowledgeBaseManifest.identifier],
    // Create search-aware enableChecker for this request
    enableChecker: ({ pluginId }) => {
      // Filter LocalSystem tool on server (it's desktop-only)
      if (pluginId === LocalSystemManifest.identifier) {
        return false;
      }

      // For WebBrowsingManifest, apply search logic
      if (pluginId === WebBrowsingManifest.identifier) {
        // TODO: Check model builtin search capability when needed
        return isSearchEnabled;
      }

      // For KnowledgeBaseManifest, only enable if knowledge is enabled
      if (pluginId === KnowledgeBaseManifest.identifier) {
        return hasEnabledKnowledgeBases;
      }

      // For all other plugins, enable by default
      return true;
    },
  });
};
