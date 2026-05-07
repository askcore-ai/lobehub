import { z } from 'zod';

// Define a union type for feature flag values: either boolean or array of user IDs
const FeatureFlagValue = z.union([z.boolean(), z.array(z.string())]);
const isDev = process.env.NODE_ENV === 'development';

export const FeatureFlagsSchema = z.object({
  check_updates: FeatureFlagValue.optional(),

  // settings
  provider_settings: FeatureFlagValue.optional(),

  openai_api_key: FeatureFlagValue.optional(),
  openai_proxy_url: FeatureFlagValue.optional(),

  // profile
  api_key_manage: FeatureFlagValue.optional(),
  edit_agent: FeatureFlagValue.optional(),

  ai_image: FeatureFlagValue.optional(),
  speech_to_text: FeatureFlagValue.optional(),
  token_counter: FeatureFlagValue.optional(),

  welcome_suggest: FeatureFlagValue.optional(),
  changelog: FeatureFlagValue.optional(),

  market: FeatureFlagValue.optional(),
  knowledge_base: FeatureFlagValue.optional(),

  rag_eval: FeatureFlagValue.optional(),

  // internal flag
  agent_self_iteration: FeatureFlagValue.optional(),
  agent_onboarding: FeatureFlagValue.optional(),
  agent_task: FeatureFlagValue.optional(),
  cloud_promotion: FeatureFlagValue.optional(),

  // the flags below can only be used with commercial license
  // if you want to use it in the commercial usage
  // please contact us for more information: hello@lobehub.com
  commercial_hide_github: FeatureFlagValue.optional(),
  commercial_hide_docs: FeatureFlagValue.optional(),

});

export type IFeatureFlags = z.infer<typeof FeatureFlagsSchema>;

/**
 * Evaluate a feature flag value against a user ID
 * @param flagValue - The feature flag value (boolean or array of user IDs)
 * @param userId - The current user ID
 * @returns boolean indicating if the feature is enabled for the user
 */
export const evaluateFeatureFlag = (
  flagValue: boolean | string[] | undefined,
  userId?: string,
  userEmail?: string,
): boolean | undefined => {
  if (typeof flagValue === 'boolean') return flagValue;

  if (Array.isArray(flagValue)) {
    const allowlist = new Set(flagValue.map((value) => value.trim().toLowerCase()).filter(Boolean));
    const identities = [userId, userEmail]
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    return identities.some((identity) => allowlist.has(identity));
  }
};

export const DEFAULT_FEATURE_FLAGS: IFeatureFlags = {
  provider_settings: true,

  openai_api_key: true,
  openai_proxy_url: true,

  api_key_manage: false,
  edit_agent: true,

  ai_image: true,

  check_updates: true,
  welcome_suggest: true,
  token_counter: true,

  knowledge_base: true,
  rag_eval: false,

  agent_self_iteration: isDev,
  agent_onboarding: isDev,
  agent_task: isDev,
  cloud_promotion: false,

  market: true,
  speech_to_text: true,
  changelog: true,

  // the flags below can only be used with commercial license
  // if you want to use it in the commercial usage
  // please contact us for more information: hello@lobehub.com
  commercial_hide_github: false,
  commercial_hide_docs: false,

};

export const mapFeatureFlagsEnvToState = (
  config: IFeatureFlags,
  userId?: string,
  userEmail?: string,
) => {
  return {
    isAgentEditable: evaluateFeatureFlag(config.edit_agent, userId, userEmail),
    showProvider: evaluateFeatureFlag(config.provider_settings, userId, userEmail),

    showOpenAIApiKey: evaluateFeatureFlag(config.openai_api_key, userId, userEmail),
    showOpenAIProxyUrl: evaluateFeatureFlag(config.openai_proxy_url, userId, userEmail),

    showApiKeyManage: evaluateFeatureFlag(config.api_key_manage, userId, userEmail),

    showAiImage: evaluateFeatureFlag(config.ai_image, userId, userEmail),
    showChangelog: evaluateFeatureFlag(config.changelog, userId, userEmail),

    enableCheckUpdates: evaluateFeatureFlag(config.check_updates, userId, userEmail),
    showWelcomeSuggest: evaluateFeatureFlag(config.welcome_suggest, userId, userEmail),

    enableKnowledgeBase: evaluateFeatureFlag(config.knowledge_base, userId, userEmail),
    enableRAGEval: evaluateFeatureFlag(config.rag_eval, userId, userEmail),
    enableAgentSelfIteration: evaluateFeatureFlag(config.agent_self_iteration, userId, userEmail),
    enableAgentOnboarding: evaluateFeatureFlag(config.agent_onboarding, userId, userEmail),
    enableAgentTask: evaluateFeatureFlag(config.agent_task, userId, userEmail),

    showCloudPromotion: evaluateFeatureFlag(config.cloud_promotion, userId, userEmail),

    showMarket: evaluateFeatureFlag(config.market, userId, userEmail),
    enableSTT: evaluateFeatureFlag(config.speech_to_text, userId, userEmail),

    hideGitHub: evaluateFeatureFlag(config.commercial_hide_github, userId, userEmail),
    hideDocs: evaluateFeatureFlag(config.commercial_hide_docs, userId, userEmail),

  };
};

export type IFeatureFlagsState = ReturnType<typeof mapFeatureFlagsEnvToState>;
